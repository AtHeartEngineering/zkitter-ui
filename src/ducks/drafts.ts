import {useSelector} from "react-redux";
import {AppRootState} from "../store/configureAppStore";
import deepEqual from "fast-deep-equal";
import {convertToRaw, EditorState} from "draft-js";
import {markdownConvertOptions} from "../components/Editor";
import {Dispatch} from "redux";
import {
    MessageType,
    Moderation,
    ModerationMessageSubType,
    Post,
    PostMessageSubType, Profile,
    ProfileMessageSubType
} from "../util/message";
import gun from "../util/gun";
import {
    genSignalHash,
    genSignedMsg,
    genExternalNullifier,
    genProof,
    genPublicSignals,
} from "libsemaphore";
import {getCircuit, getProvingKey} from "../util/fetch";
// @ts-ignore
import * as snarkjs from "snarkjs";
import {ThunkDispatch} from "redux-thunk";
const { markdownToDraft, draftToMarkdown } = require('markdown-draft-js');

enum ActionTypes {
    SET_DRAFT = 'drafts/setDraft',
    SET_SUBMITTING = 'drafts/setSubmitting',
}

type Action = {
    type: ActionTypes;
    payload?: any;
    meta?: any;
    error?: boolean;
}

type State = {
    submitting: boolean;
    map: {
        [replyId: string]: Draft;
    }
}

type Draft = {
    reference: string;
    editorState: EditorState;
}

const initialState: State = {
    submitting: false,
    map: {},
};

export const setDraft = (editorState: EditorState, reference = '') => {
    return {
        type: ActionTypes.SET_DRAFT,
        payload: {
            editorState,
            reference,
        },
    };
}

export const submitSemaphorePost = (post: Post) => async (dispatch: Dispatch, getState: () => AppRootState) => {
    const state = getState();
    const {
        semaphore,
    } = state.web3;
    const identityCommitment = semaphore.commitment;
    const identityNullifier = semaphore.identityNullifier;
    const identityTrapdoor = semaphore.identityTrapdoor;
    const identityPathElements = semaphore.identityPath?.path_elements;
    const identityPathIndex = semaphore.identityPath?.path_index;
    const privKey = semaphore.keypair?.privKey;
    const pubKey = semaphore.keypair?.pubKey;

    if (!identityCommitment || !identityPathElements || !identityPathIndex || !privKey || !pubKey || !identityTrapdoor || !identityNullifier) {
        return null;
    }

    const hash = post.hash();
    const signalStr = hash;
    const externalNullifierStr = signalStr;
    const externalNullifier = genExternalNullifier(externalNullifierStr);
    const signalHash = await genSignalHash(Buffer.from(signalStr, 'hex'));

    const { signature } = genSignedMsg(
        privKey,
        externalNullifier,
        signalHash,
    );

    const circuit = await getCircuit();
    const witness = circuit.calculateWitness({
        'identity_pk[0]': pubKey[0],
        'identity_pk[1]': pubKey[1],
        'auth_sig_r[0]': signature.R8[0],
        'auth_sig_r[1]': signature.R8[1],
        auth_sig_s: signature.S,
        signal_hash: signalHash,
        external_nullifier: externalNullifier,
        identity_nullifier: identityNullifier,
        identity_trapdoor: identityTrapdoor,
        identity_path_elements: identityPathElements,
        identity_path_index: identityPathIndex,
        fake_zero: snarkjs.bigInt(0),
    });

    const provingKey = await getProvingKey();
    // @ts-ignore
    const proof = await genProof(witness, provingKey);
    const publicSignals = genPublicSignals(witness, circuit);

    const json = post.toJSON();
    try {
        // @ts-ignore
        await fetch('http://localhost:3000/dev/semaphore/post', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                post: json,
                proof: JSON.stringify(snarkjs.stringifyBigInts(proof)),
                publicSignals: JSON.stringify(snarkjs.stringifyBigInts(publicSignals)),
            }),
        });

        dispatch({
            type: ActionTypes.SET_SUBMITTING,
            payload: false,
        });

        dispatch(setDraft(EditorState.createEmpty(), `${post.creator}/${hash}`));
    } catch (e) {
        dispatch({
            type: ActionTypes.SET_SUBMITTING,
            payload: false,
        });
        throw e;
    }

}

export const submitPost = (reference = '') => async (dispatch: ThunkDispatch<any, any, any>, getState: () => AppRootState) => {
    dispatch({
        type: ActionTypes.SET_SUBMITTING,
        payload: true,
    });

    const { drafts, web3 } = getState();
    const draft = drafts.map[reference];
    const {
        ensName,
        semaphore,
    } = web3;

    if (!draft) return;

    const currentContent = draft.editorState.getCurrentContent();
    const markdown = draftToMarkdown(convertToRaw(currentContent), markdownConvertOptions);

    const post = new Post({
        type: MessageType.Post,
        subtype: reference ? PostMessageSubType.Reply : PostMessageSubType.Default,
        creator: ensName,
        payload: {
            content: markdown,
            reference: reference,
        },
    });

    if (semaphore.keypair.privKey) {
        return dispatch(submitSemaphorePost(post));
    }

    const {
        messageId,
        hash,
        ...json
    } = await post.toJSON();

    try {
        // @ts-ignore
        await gun.user()
            .get('message')
            .get(messageId)
            // @ts-ignore
            .put(json);

        dispatch({
            type: ActionTypes.SET_SUBMITTING,
            payload: false,
        });

        dispatch(setDraft(EditorState.createEmpty(), reference));
    } catch (e) {
        dispatch({
            type: ActionTypes.SET_SUBMITTING,
            payload: false,
        });
        throw e;
    }
}

export const submitRepost = (reference = '') => async (dispatch: Dispatch, getState: () => AppRootState) => {
    dispatch({
        type: ActionTypes.SET_SUBMITTING,
        payload: true,
    });

    const { web3 } = getState();
    const {
        ensName,
    } = web3;

    const post = new Post({
        type: MessageType.Post,
        subtype: PostMessageSubType.Repost,
        creator: ensName,
        payload: {
            reference: reference,
        },
    });

    const {
        messageId,
        hash,
        ...json
    } = await post.toJSON();

    try {
        // @ts-ignore
        await gun.user()
            .get('message')
            .get(messageId)
            // @ts-ignore
            .put(json);

        dispatch({
            type: ActionTypes.SET_SUBMITTING,
            payload: false,
        });

        dispatch(setDraft(EditorState.createEmpty(), reference));
    } catch (e) {
        dispatch({
            type: ActionTypes.SET_SUBMITTING,
            payload: false,
        });
        throw e;
    }
}

export const submitModeration = (reference = '', subtype: ModerationMessageSubType) => async (dispatch: Dispatch, getState: () => AppRootState) => {
    dispatch({
        type: ActionTypes.SET_SUBMITTING,
        payload: true,
    });

    const { web3 } = getState();
    const {
        ensName,
    } = web3;

    const moderation = new Moderation({
        type: MessageType.Moderation,
        subtype: subtype,
        creator: ensName,
        payload: {
            reference: reference,
        },
    });

    const {
        messageId,
        hash,
        ...json
    } = await moderation.toJSON();

    try {
        // @ts-ignore
        await gun.user()
            .get('message')
            .get(messageId)
            // @ts-ignore
            .put(json);

        dispatch({
            type: ActionTypes.SET_SUBMITTING,
            payload: false,
        });

        dispatch(setDraft(EditorState.createEmpty(), reference));
    } catch (e) {
        dispatch({
            type: ActionTypes.SET_SUBMITTING,
            payload: false,
        });
        throw e;
    }
}

export const submitProfile = (
    subtype: ProfileMessageSubType,
    value: string,
    key?: string,
) => async (dispatch: Dispatch, getState: () => AppRootState) => {
    dispatch({
        type: ActionTypes.SET_SUBMITTING,
        payload: true,
    });

    const { web3 } = getState();
    const {
        ensName,
    } = web3;

    const post = new Profile({
        type: MessageType.Profile,
        subtype: subtype,
        creator: ensName,
        payload: {
            key: key || '',
            value: value,
        },
    });

    const {
        messageId,
        hash,
        ...json
    } = await post.toJSON();

    try {
        // @ts-ignore
        await gun.user()
            .get('message')
            .get(messageId)
            // @ts-ignore
            .put(json);

        dispatch({
            type: ActionTypes.SET_SUBMITTING,
            payload: false,
        });
    } catch (e) {
        dispatch({
            type: ActionTypes.SET_SUBMITTING,
            payload: false,
        });
        throw e;
    }
}

export const useDraft = (reference = ''): Draft => {
    return useSelector((state: AppRootState) => {
        const draft = state.drafts.map[reference];

        return draft
            ? draft
            : {
                reference,
                editorState: EditorState.createEmpty(),
            };
    }, deepEqual);
}

export default function drafts(state = initialState, action: Action): State {
    switch (action.type) {
        case ActionTypes.SET_DRAFT:
            return {
                ...state,
                map: {
                    ...state.map,
                    [action.payload.reference || '']: action.payload,
                },
            };
        default:
            return state;
    }
}