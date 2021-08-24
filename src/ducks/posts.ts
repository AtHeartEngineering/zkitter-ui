import {parseMessageId, Post, PostMessageOption, PostMessageSubType} from "../util/message";
import {fetchMessage} from "../util/gun";
import {getUser, User} from "./users";
import {ThunkDispatch} from "redux-thunk";
import {AppRootState} from "../store/configureAppStore";
import {useSelector} from "react-redux";
import deepEqual from "fast-deep-equal";
import config from "../util/config";
import {Dispatch} from "redux";

enum ActionTypes {
    SET_POSTS = 'posts/setPosts',
    SET_POST = 'posts/setPost',
    SET_META = 'posts/setMeta',
    APPEND_POSTS = 'posts/appendPosts',
}

type Action = {
    type: ActionTypes;
    payload?: any;
    meta?: any;
    error?: boolean;
}

type PostMeta = {
    replyCount: number;
    likeCount: number;
    repostCount: number;
    liked: boolean;
    reposted: boolean;
}

type State = {
    map: { [messageId: string]: Post };
    meta: {
        [messageId: string]: PostMeta;
    };
}

const initialState: State = {
    map: {},
    meta: {},
};


export const fetchMeta = (messageId: string) => async (
    dispatch: ThunkDispatch<any, any, any>, getState: () => AppRootState
) => {
    const {
        web3: {
            ensName,
            gun: { pub, priv },
        },
    } = getState();
    const [username, hash] = messageId.split('/');

    if (!hash) {
        return null;
    }

    const contextualName = (ensName && pub && priv) ? ensName : undefined;
    const resp = await fetch(`${config.indexerAPI}/v1/post/${hash || username}`, {
        method: 'GET',
        // @ts-ignore
        headers: {
            'x-contextual-name': contextualName,
        },
    });
    const json = await resp.json();
    const post = json.payload;

    dispatch({
        type: ActionTypes.SET_META,
        payload: {
            messageId: post.subtype === PostMessageSubType.Repost
                ? post.payload.reference
                : post.messageId,
            meta: post.meta,
        },
    });
}

export const fetchPost = (messageId: string) =>
    async (
        dispatch: ThunkDispatch<any, any, any>,
        getState: () => AppRootState,
    ): Promise<PostMessageOption | null> =>
{
    const {creator, hash} = parseMessageId(messageId);
    const user: any = await dispatch(getUser(creator));

    let message;

    if (!creator) {
        message = await fetchMessage(`message/${messageId}`);
    } else if (creator && hash) {
        message = await fetchMessage(`~${user.pubkey}/message/${messageId}`);
    }

    if (!message) return null;

    dispatch({
        type: ActionTypes.SET_POST,
        payload: new Post({
            ...message,
            creator: creator,
        }),
    });

    return {
        ...message,
        creator: creator,
    };
}

export const fetchPosts = (creator?: string, limit = 10, offset = 0) =>
    async (
        dispatch: ThunkDispatch<any, any, any>,
        getState: () => AppRootState,
    ) =>
{
    const {
        web3: {
            ensName,
            gun: { pub, priv },
        },
    } = getState();
    const creatorQuery = creator ? `&creator=${encodeURIComponent(creator)}` : '';
    const contextualName = (ensName && pub && priv) ? ensName : undefined;
    const resp = await fetch(`${config.indexerAPI}/v1/posts?limit=${limit}&offset=${offset}${creatorQuery}`, {
        method: 'GET',
        // @ts-ignore
        headers: {
            'x-contextual-name': contextualName,
        },
    });
    const json = await resp.json();
    dispatch(processPosts(json.payload));

    return json.payload.map((post: any) => post.messageId);
}

export const fetchLikedBy = (creator?: string, limit = 10, offset = 0) =>
    async (
        dispatch: ThunkDispatch<any, any, any>,
        getState: () => AppRootState,
    ) =>
{
    const {
        web3: {
            ensName,
            gun: { pub, priv },
        },
    } = getState();
    const contextualName = (ensName && pub && priv) ? ensName : undefined;
    const resp = await fetch(`${config.indexerAPI}/v1/${creator}/likes?limit=${limit}&offset=${offset}`, {
        method: 'GET',
        // @ts-ignore
        headers: {
            'x-contextual-name': contextualName,
        },
    });
    const json = await resp.json();
    dispatch(processPosts(json.payload));

    return json.payload.map((post: any) => post.messageId);
}


export const fetchRepliedBy = (creator: string, limit = 10, offset = 0) =>
    async (
        dispatch: ThunkDispatch<any, any, any>,
        getState: () => AppRootState,
    ) =>
{
    const {
        web3: {
            ensName,
            gun: { pub, priv },
        },
    } = getState();
    const contextualName = (ensName && pub && priv) ? ensName : undefined;
    const resp = await fetch(`${config.indexerAPI}/v1/${creator}/replies?limit=${limit}&offset=${offset}`, {
        method: 'GET',
        // @ts-ignore
        headers: {
            'x-contextual-name': contextualName,
        },
    });
    const json = await resp.json();
    dispatch(processPosts(json.payload));

    return json.payload.map((post: any) => post.messageId);
}

const processPosts = (posts: any[]) => async (dispatch: Dispatch) => {
    for (const post of posts) {
        dispatch({
            type: ActionTypes.SET_META,
            payload: {
                messageId: post.subtype === PostMessageSubType.Repost
                    ? post.payload.reference
                    : post.messageId,
                meta: post.meta,
            },
        });

        dispatch({
            type: ActionTypes.SET_POST,
            payload: new Post({
                ...post,
                createdAt: new Date(post.createdAt),
            }),
        });

    }

    setTimeout(() => {
        // @ts-ignore
        posts.forEach((post: any) => dispatch(fetchPost(post.messageId)));
    }, 0);
}

export const fetchHomeFeed = (limit = 10, offset = 0) =>
    async (
        dispatch: ThunkDispatch<any, any, any>,
        getState: () => AppRootState,
    ) =>
{
    const {
        web3: {
            ensName,
            gun: { pub, priv },
        },
    } = getState();
    const contextualName = (ensName && pub && priv) ? ensName : undefined;
    const resp = await fetch(`${config.indexerAPI}/v1/homefeed?limit=${limit}&offset=${offset}`, {
        method: 'GET',
        // @ts-ignore
        headers: {
            'x-contextual-name': contextualName,
        },
    });
    const json = await resp.json();

    for (const post of json.payload) {
        const [creator, hash] = post.messageId.split('/');

        dispatch({
            type: ActionTypes.SET_META,
            payload: {
                messageId: post.subtype === PostMessageSubType.Repost
                    ? post.payload.reference
                    : post.messageId,
                meta: post.meta,
            },
        });

        dispatch({
            type: ActionTypes.SET_POST,
            payload: new Post({
                ...post,
                createdAt: new Date(post.createdAt),
            }),
        });
    }

    setTimeout(() => {
        json.payload.forEach((post: any) => dispatch(fetchPost(post.messageId)));
    }, 0);

    return json.payload.map((post: any) => post.messageId);
}

export const fetchReplies = (reference: string, limit = 10, offset = 0) =>
    async (dispatch: ThunkDispatch<any, any, any>, getState: () => AppRootState) =>
{
    const {
        web3: {
            ensName,
            gun: { pub, priv },
        },
    } = getState();
    const contextualName = (ensName && pub && priv) ? ensName : undefined;
    const resp = await fetch(`${config.indexerAPI}/v1/replies?limit=${limit}&offset=${offset}&parent=${encodeURIComponent(reference)}`, {
        method: 'GET',
        // @ts-ignore
        headers: {
            'x-contextual-name': contextualName,
        },
    });
    const json = await resp.json();

    for (const post of json.payload) {
        const [creator, hash] = post.messageId.split('/');

        dispatch({
            type: ActionTypes.SET_META,
            payload: {
                messageId: post.subtype === PostMessageSubType.Repost
                    ? post.payload.reference
                    : post.messageId,
                meta: post.meta,
            },
        });

        dispatch({
            type: ActionTypes.SET_POST,
            payload: new Post({
                ...post,
                createdAt: new Date(post.createdAt),
            }),
        });
    }

    setTimeout(() => {
        json.payload.forEach((post: any) => dispatch(fetchPost(post.messageId)));
    }, 0);

    return json.payload.map((post: any) => post.messageId);
}

export const usePosts = (): State => {
    return useSelector((state: AppRootState) => {
        return state.posts;
    }, deepEqual);
}

export const usePost = (messageId?: string): Post | null => {
    return useSelector((state: AppRootState) => {
        return state.posts.map[messageId || ''] || null;
    }, deepEqual);
}

export const useMeta = (messageId: string)  => {
    return useSelector((state: AppRootState): PostMeta => {
        return state.posts.meta[messageId] || {
            replyCount: 0,
            repostCount: 0,
            likeCount: 0,
            liked: 0,
            reposted: 0,
        };
    }, deepEqual);
}

export default function posts(state = initialState, action: Action): State {
    switch (action.type) {
        case ActionTypes.SET_POSTS:
            return reduceSetPosts(state, action);
        case ActionTypes.SET_POST:
            return reduceSetPost(state, action);
        case ActionTypes.SET_META:
            return reduceSetMeta(state, action);
        case ActionTypes.APPEND_POSTS:
            return reduceAppendPosts(state, action);
        default:
            return state;
    }
}

function reduceSetPost(state: State, action: Action): State {
    const post = action.payload as Post;
    const hash = post.hash();
    const messageId = post.creator ? post.creator + '/' + hash : hash;

    return {
        ...state,
        map: {
            ...state.map,
            [messageId]: post
        },
    };
}

function reduceSetPosts(state: State, action: Action): State {
    const payload = action.payload as Post[];
    const posts: { [h: string]: Post } = {};

    for (const post of payload) {
        const hash = post.hash();
        const messageId = post.creator ? post.creator + '/' + hash : hash;
        posts[messageId] = post;
    }

    return {
        ...state,
        map: posts,
    };
}

function reduceSetMeta(state: State, action: Action): State {
    const post = action.payload;
    const {meta} = post;

    const messageId = post.subtype === PostMessageSubType.Repost
        ? post.payload.reference
        : post.messageId;

    return {
        ...state,
        meta: {
            ...state.meta,
            [messageId]: meta
        },
    };
}

function reduceAppendPosts(state: State, action: Action): State {
    const payload = action.payload as Post[];
    const posts: { [h: string]: Post } = {};

    for (const post of payload) {
        const messageId = post.creator + '/' + post.hash();
        posts[messageId] = post;
    }

    return {
        ...state,
        ...posts,
    };
}