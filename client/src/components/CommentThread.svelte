<script lang="ts">
import { Comments } from "../schema/app-schema";
import * as Y from "yjs";
import type { Comment } from "../schema/app-schema";
import type { ItemLike } from "../types/yjs-types";
import { getLogger } from "../lib/logger";
import { isForeignInput } from "../lib/KeyEventHandler";
import { onMount } from "svelte";
import { editorOverlayStore } from "../stores/EditorOverlayStore.svelte";
const logger = getLogger("CommentThread");


interface Props {
    comments?: Comments;
    currentUser: string;

    onCountChanged?: (count: number) => void;
    item?: ItemLike; // Outliner Item (for late-binding comments getter)
}

let props: Props = $props();
let comments = $derived.by(() => props.comments ?? props.item?.comments);
let onCountChanged = $derived.by(() => props.onCountChanged);
let newText = $state("");
let editingId = $state<string | null>(null);
let editText = $state("");
let localComments = $state<Comment[]>([]);
let renderCommentsState = $state<Comment[]>([]);
let threadRef: HTMLElement | null = null;


let lastNotifiedCount = $state(-1);




// initial recompute deferred until commentsSubscriber is initialized

// Subscribe using Yjs minimal granularity observe (deep monitoring of Y.Array<Y.Map>)
onMount(() => {
    let unobserve: (() => void) | undefined;
    try {
        // 1) Get internal yArray if Comments wrapper exists (private but accessible in JS)
        let yarr: import("yjs").Array<import("yjs").Map<unknown>> | undefined = (comments as unknown as { yArray?: import("yjs").Array<import("yjs").Map<unknown>> })?.yArray;
        // 2) If not, ensure "comments" via item Y.Map
        if (!yarr && props.item) {
            const item = props.item as ItemLike;
            const tree = item?.tree;
            const key = item?.key;
            const value = tree?.getNodeValueFromKey?.(key) as Y.Map<unknown> | undefined;
            if (value) {
                yarr = value.get?.("comments") as Y.Array<Y.Map<unknown>> | undefined;
                if (!yarr) {
                    yarr = new Y.Array<Y.Map<unknown>>();
                    value.set?.("comments", yarr);
                }
            }
        }
        if (yarr && typeof yarr.observeDeep === "function") {
            // Use the Y.Array directly to get the plain array, rather than going through the comment object which might be outdated
            const handler = () => {
                try {
                    // Convert the Y.Array directly to plain objects
                    const plainComments = yarr.toArray().map((yMap: Y.Map<unknown>) => ({
                        id: yMap.get("id") as string,
                        author: yMap.get("author") as string,
                        text: yMap.get("text") as string,
                        created: yMap.get("created") as number,
                        lastChanged: yMap.get("lastChanged") as number,
                    }));
                    // Only update renderCommentsState if it's different from the Yjs state
                    // This prevents the observer from overwriting UI changes when they're more recent
                    const currentRenderState = renderCommentsState;
                    const needsUpdate = plainComments.length !== currentRenderState.length ||
                        plainComments.some((yjsComment, index) => {
                            const currentComment = currentRenderState[index];
                            return !currentComment || currentComment.id !== yjsComment.id || currentComment.text !== yjsComment.text;
                        });

                    if (needsUpdate) {
                        renderCommentsState = plainComments;
                    }
                } catch (e) {
                    logger.error({ error: e as Error }, "Error in observe handler");
                }
            };
            yarr.observeDeep(handler);
            unobserve = () => { try { yarr.unobserveDeep(handler); } catch (_e) { /* ignore */ } };
            // Initial reflection
            handler();
        }
    } catch (_e) { /* ignore */ }
    return () => { try { unobserve?.(); } catch (_e) { /* ignore */ } };
});













// Prioritize local updates here; Yjs side synchronization is expected to be reflected in subsequent transactions

function add() {
        // Get value from DOM as well to enable adding even in environments where bind:value doesn't work
    let text = newText;

    if (!text) return;
    let commentsObj: Comments | undefined = props.comments ?? props.item?.comments;
    if (!commentsObj && props.item) {
        try {
            const item = props.item as ItemLike;
            const tree = item?.tree;

            const key = item?.key;
            if (tree && key) {
                const value = tree.getNodeValueFromKey(key) as Y.Map<unknown>;
                let arr = value.get("comments") as Y.Array<Y.Map<unknown>> | undefined;
                if (!arr) {
                    arr = new Y.Array<Y.Map<unknown>>();
                    value.set("comments", arr);
                }
                commentsObj = new Comments(arr as unknown as import("yjs").Array<import("yjs").Map<import("../types/yjs-types").CommentValueType>>);
                logger.debug({}, '[CommentThread] initialized comments via tree/key fallback');
            }
        } catch (e) {
            logger.warn({ error: e }, '[CommentThread] failed to ensure comments via fallback');
        }
    }
    const user = props.currentUser;

    logger.debug({ newText }, '[CommentThread] add comment, newText=');
    logger.debug({ commentsObj, hasItem: !!props.item, hasComments: !!props.item?.comments }, '[CommentThread] comments object:');

    // Proceed with UI even if comments object is invalid (ensure reflection via DOM/events)
    const time = Date.now();
    let id: string;
    if (commentsObj && typeof commentsObj.addComment === 'function') {
        const res = commentsObj.addComment(user, newText);
        id = res?.id || `local-${time}-${Math.random().toString(36).slice(2)}`;
        logger.debug({ id }, '[CommentThread] comment added to Yjs, id=');
    } else {
        logger.error({ error: new Error("invalid or missing addComment") }, '[CommentThread] comments object is invalid or missing addComment; falling back to local DOM only');
        id = `local-${time}-${Math.random().toString(36).slice(2)}`;
    }

    // Reflect to DOM immediately with optimistic local addition
    try {
        const optimistic: Comment = { id, author: user, text: newText, created: time, lastChanged: time };
        localComments = [...localComments, optimistic];

    } catch (_e) { /* ignore */ }


    // Normal path: Sync state after Yjs addition and notify parent with exact count
    try {

        // Calculate the count directly from the Yjs array which should be updated immediately after add
        let countNow = 0;
        if (commentsObj && typeof commentsObj.length === 'number') {
            countNow = commentsObj.length;
        } else {
            // Fallback: try to get the length from the item's comments
            try {
                if (props.item && typeof props.item.comments !== 'undefined') {
                    const itemComments = props.item.comments;
                    if (typeof itemComments.length === 'number') {
                        countNow = itemComments.length;
                    }
                }
            } catch (_e) { /* ignore */ }
        }
        // Only notify if count actually changed to prevent infinite loops
        if (countNow !== lastNotifiedCount) {
            lastNotifiedCount = countNow;
            // Notify parent (OutlinerItem) via props callback only
            try { onCountChanged?.(countNow); } catch (_e) { /* ignore */ }
        }
    } catch (e) {
        logger.error({ error: e as Error }, '[CommentThread] failed to sync after add');
    }







        newText = '';
}
function remove(id: string) {
    let commentsObj: Comments | undefined = props.comments ?? props.item?.comments;
    if (!commentsObj && props.item) {
        try {
            const item = props.item as ItemLike;
            const tree = item?.tree;
            const key = item?.key;
            if (tree && key) {
                const value = tree.getNodeValueFromKey(key) as Y.Map<unknown>;
                let arr = value.get("comments") as Y.Array<Y.Map<unknown>> | undefined;
                if (!arr) { arr = new Y.Array<Y.Map<unknown>>(); value.set("comments", arr); }
                commentsObj = new Comments(arr as unknown as import("yjs").Array<import("yjs").Map<import("../types/yjs-types").CommentValueType>>);
                logger.debug({}, '[CommentThread] ensured comments for remove via tree/key');
            }
        } catch (e) {
            logger.warn({ error: e }, '[CommentThread] failed to ensure comments for remove');
        }
    }
    try { commentsObj?.deleteComment?.(id); } catch (e) { logger.error({ error: e as Error }, '[CommentThread] deleteComment error'); }
    try { /* Yjs  derived updates; no direct assignment to commentsList */ } catch (e) { logger.error({ error: e as Error }, '[CommentThread] toPlain after delete error'); }
    localComments = localComments.filter(c => c.id !== id);

    const countNow = renderCommentsState.length;
    // Only notify if count actually changed to prevent infinite loops
    if (countNow !== lastNotifiedCount) {
        lastNotifiedCount = countNow;
        try { onCountChanged?.(countNow); } catch (_e) { /* ignore */ }
    }
}

function startEdit(c: Comment) {
    editingId = c.id;
    editText = c.text;
}

function saveEdit(id: string) {
    // Removed to fix state_referenced_locally
    let commentsObj: Comments | undefined = props.comments ?? props.item?.comments;
    if (!commentsObj && props.item) {
        try {
            const item = props.item as ItemLike;
            const tree = item?.tree;
            const key = item?.key;
            if (tree && key) {
                const value = tree.getNodeValueFromKey(key) as Y.Map<unknown>;
                let arr = value.get("comments") as Y.Array<Y.Map<unknown>> | undefined;
                if (!arr) { arr = new Y.Array<Y.Map<unknown>>(); value.set("comments", arr); }
                commentsObj = new Comments(arr as unknown as import("yjs").Array<import("yjs").Map<import("../types/yjs-types").CommentValueType>>);
                logger.debug({}, '[CommentThread] ensured comments for saveEdit via tree/key');
            }
        } catch (e) {
            logger.warn({ error: e }, '[CommentThread] failed to ensure comments for saveEdit');
        }
    }

    // Update the Yjs document
    try {
        commentsObj?.updateComment?.(id, editText);
        logger.debug({}, '[CommentThread] updateComment called');
    } catch (e) {
        logger.error({ error: e as Error }, '[CommentThread] updateComment error');
    }

    try { /* Yjs derived updates; no direct assignment to commentsList */ logger.debug({}, '[CommentThread] updateComment applied'); } catch (e) { logger.error({ error: e as Error }, '[CommentThread] toPlain after update error'); }

    // Update local state to immediately reflect the change while we wait for Yjs observer
    localComments = localComments.map(c => c.id === id ? { ...c, text: editText, lastChanged: Date.now() } : c);

    // Update renderCommentsState to immediately show the change in UI, but only update the specific field
    renderCommentsState = renderCommentsState.map(c => c.id === id ? { ...c, text: editText, lastChanged: Date.now() } : c);

    // Removed to fix state_referenced_locally
    editingId = null;
    
    // Dispatch an event to notify that a comment was edited
    try { 
        threadRef?.dispatchEvent(new CustomEvent('comment-edited', { bubbles: true, detail: { id, text: editText } })); 
    } catch (e) { 
        logger.error({ error: e as Error }, '[CommentThread] failed to dispatch comment-edited event');
    }
}


</script>



<!--
    Stop pointerdown/mousedown/click from bubbling to OutlinerItem's item-editing handlers
    (handleMouseDown/handleClick), which otherwise treat any click inside this thread as a
    request to start editing the item's own text and steal focus to its textarea - cancelling,
    among other things, the Add button's native form-submit default action before it can run.
-->
<div
    class="comment-thread"
    role="presentation"
    data-testid="comment-thread"
    bind:this={threadRef}
    onpointerdown={(e) => e.stopPropagation()}
    onmousedown={(e) => e.stopPropagation()}
    onclick={(e) => e.stopPropagation()}
    onfocusin={(e) => {
        if (isForeignInput(e.target)) {
            editorOverlayStore.clearCursorAndSelection("local", true);
        }
    }}
>
    <div class="comment-summary"><span class="thread-comment-count">{renderCommentsState.length}</span></div>
    {#each renderCommentsState as c (c.id)}
        <div class="comment" data-testid="comment-{c.id}">
            {#if editingId === c.id}
                <input bind:value={editText} data-testid="edit-input-{c.id}" aria-label="Edit comment text" />
                <button type="button" onclick={() => saveEdit(c.id)} data-testid="save-edit-{c.id}" title="Save">Save</button>
                <button type="button" onclick={() => (editingId = null)} data-testid="cancel-edit-{c.id}" title="Cancel">Cancel</button>
            {:else}
                <span class="author">{c.author}:</span>
                <span class="text">{c.text}</span>
                <button type="button" onclick={() => startEdit(c)} class="edit" aria-label="Edit comment" title="Edit">✎</button>
                <button type="button" onclick={() => remove(c.id)} class="delete" aria-label="Delete comment" title="Delete">×</button>
            {/if}
        </div>
    {/each}
    <form
        onsubmit={(e) => { e.preventDefault(); try { add(); } catch (err) { logger.error({ error: err as Error }, '[CommentThread] submit add error'); } }}
        data-testid="comment-form"
    >
        <input placeholder="Add comment" bind:value={newText} data-testid="new-comment-input" aria-label="New comment text" />
        <button type="submit" data-testid="add-comment-btn">Add</button>
    </form>
</div>

<style>
.comment-thread {
    margin-top: 4px;
    padding-left: 20px;
}
.comment {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 2px;
}
.comment .delete {
    background: none;
    border: none;
    color: #c00;
    cursor: pointer;
}
.comment .edit {
    background: none;
    border: none;
    color: #007acc;
    cursor: pointer;
}
</style>
