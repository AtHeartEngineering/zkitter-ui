import React, {MouseEventHandler, ReactElement, useEffect} from "react";
import {fetchMeta, useGoToPost, usePost} from "../../ducks/posts";
import Post from "../Post";
import {Post as PostMessage, PostMessageSubType} from "../../util/message";
import classNames from "classnames";
import {useDispatch} from "react-redux";
import {useLoggedIn} from "../../ducks/web3";
import {useThemeContext} from "../ThemeContext";

type Props = {
    level?: number;
    messageId: string;
    className?: string;
    postClassName?: string;
    onClick?: MouseEventHandler;
    onSuccessPost?: (post: PostMessage) => void;
    expand?: boolean;
};

export default function ParentThread(props: Props): ReactElement {
    const post = usePost(props.messageId);
    // @ts-ignore
    const parent = [PostMessageSubType.Reply, PostMessageSubType.MirrorReply].includes(post?.subtype)
        ? post?.payload.reference
        : '';
    const gotoPost = useGoToPost();
    const dispatch = useDispatch();
    const loggedIn = useLoggedIn();
    const theme = useThemeContext();

    useEffect(() => {
        (async function onPostViewMount() {
            if (!parent) return;
            await dispatch(fetchMeta(parent));
        })();

    }, [loggedIn, parent]);

    if (!parent) return <></>;

    return (
        <>
            <ParentThread
                className={props.className}
                messageId={parent}
                onSuccessPost={props.onSuccessPost}
            />
            <Post
                messageId={parent}
                className={classNames(
                    "cursor-pointer hover:bg-gray-50 parent-post",
                    {
                        'hover:bg-gray-50 ': theme !== 'dark',
                        'hover:bg-gray-900 ': theme === 'dark',
                    },
                    props.className,
                )}
                onClick={() => gotoPost(parent)}
                onSuccessPost={props.onSuccessPost}
                isParent
            />
        </>
    );
}