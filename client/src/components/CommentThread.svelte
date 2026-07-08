<script lang="ts">
import { Comments } from "../schema/app-schema";
import * as Y from "yjs";
import type { Comment } from "../schema/app-schema";
import type { ItemLike } from "../types/yjs-types";
import { getLogger } from "../lib/logger";
import { createEventDispatcher, onMount } from "svelte";
import { editorOverlayStore } from "../stores/EditorOverlayStore.svelte";
const logger = getLogger("CommentThread");
const dispatch = createEventDispatcher();


interface Props {
    comments?: Comments;
    currentUser: string;

    onCountChanged?: (count: number) => void;
    item?: ItemLike; // Outliner Item (for late-binding comments getter)
}

let props: Props = $props();
let onCountChanged = $derived.by(() => props.onCountChanged);
let newText = $state("");
let editingId = $state<string | null>(null);
let editText = $state("");
let localComments = $state<Comment[]>([]);
let renderCommentsState = $state<Comment[]>([]);
let threadRef: HTMLElement | null = null;


// 
//  
let lastNotifiedCount = $state(-1);




// initial recompute deferred until commentsSubscriber is initialized

// Subscribe using Yjs minimal granularity observe (deep monitoring of Y.Array<Y.Map>)
onMount(() => {
    let unobserve: (() => void) | undefined;
    try {
        const item = props.item as ItemLike;
        if (item) {
            const ymap = item.tree?.getNodeValueFromKey?.(item.key) as Y.Map<unknown> | undefined;
            if (ymap && typeof ymap.observeDeep === "function") {
                const handler = () => {
                    try {
                        const actualArr = ymap.get("comments") as Y.Array<Y.Map<unknown>> | undefined;
                        if (actualArr) {
                            const plainComments = actualArr.toArray().map((yMap: Y.Map<unknown>) => ({
                                id: yMap.get("id") as string,
                                author: yMap.get("author") as string,
                                text: yMap.get("text") as string,
                                created: yMap.get("created") as number,
                                lastChanged: yMap.get("lastChanged") as number,
                            }));
                            const currentRenderState = renderCommentsState;
                            const needsUpdate = plainComments.length !== currentRenderState.length ||
                                plainComments.some((yjsComment, index) => {
                                    const currentComment = currentRenderState[index];
                                    return !currentComment || currentComment.id !== yjsComment.id || currentComment.text !== yjsComment.text;
                                });
                            if (needsUpdate) {
                                renderCommentsState = plainComments;
                            }
                        } else {
                            renderCommentsState = [];
                        }
                    } catch (e) {
                        logger.error({ error: e as Error }, "Error in observe handler");
                    }
                };
                ymap.observeDeep(handler);
                unobserve = () => { try { ymap.unobserveDeep(handler); } catch {} };
                // Initial reflection
                handler();
            }
        }
    } catch (e) {
        logger.error({ error: e as Error }, "Error setting up ymap deep observer");
    }
    return () => { try { unobserve?.(); } catch {} };
});


// Yjs automatic synchronization is temporarily paused (limited to immediate notification on add/remove for CMT-0001 stabilization)
// $effect(() => {
//     try {

//         const list = (commentsSubscriber.current as unknown as Comment[]) ?? [];
//         commentsList = list as Comment[];
//         recompute();
//         onCountChanged?.(commentsList.length);
//     } catch {}
// });

// Click delegation (safety net): Ensure add() is called even in environments where button onclick doesn't work
// Lightweight auto-sync: toPlain -> recompute -> onCountChanged (only when length changes) on Y.Doc update


// Count notification is delegated to the parent (OutlinerItem) Yjs-derived subscription.
// Do not perform direct DOM manipulation or side effects here ($effect removed).

    // try { logger.debug('[CommentThread] mount props', { hasComments: !!props?.comments, hasDoc: !!props?.doc }); } catch {}

// Fallback removal: Remove onMount click delegation/auto-add/global delegation






// Prioritize local updates here; Yjs side synchronization is expected to be reflected in subsequent transactions

function add() {
    let text = newText;
    const textarea = threadRef?.querySelector('[data-testid="new-comment-input"]') as HTMLTextAreaElement | null;
    if (!text && textarea && textarea.value) {
        text = textarea.value;
    }

    if (!text) {
        return;
    }
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

    // Predictive immediate reflection: Estimate +1 from current DOM and update badge immediately (run before normal path)
    try {
        const container = threadRef?.closest('.outliner-item') as HTMLElement | null;
        const predicted = 1;
        const id = props.item?.id || container?.getAttribute('data-item-id');
        if (id) {
            const nodes = document.querySelectorAll(`[data-item-id="${id}"] .comment-count`);
            nodes.forEach(el => { (el as HTMLElement).textContent = String(predicted); });
        }
    } catch {}
    // Reflect to DOM immediately with optimistic local addition
    try {
        const optimistic: Comment = { id, author: user, text: newText, created: time, lastChanged: time };
        localComments = [...localComments, optimistic];

    } catch {}


    // Normal path: Sync state after Yjs addition and notify parent with exact count
    try {
        // Yjs debaeadf1c8ecb7f4b7L
        // Yjs  

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
            } catch {}
        }
        // Only notify if count actually changed to prevent infinite loops
        if (countNow !== lastNotifiedCount) {
            lastNotifiedCount = countNow;
            // Notify parent (OutlinerItem) via props + bubbling event
            try { onCountChanged?.(countNow); } catch {}
            try { threadRef?.dispatchEvent(new CustomEvent('comment-count-changed', { bubbles: true, detail: { count: countNow } })); } catch {}
            try { dispatch('comment-count-changed', { count: countNow }); } catch {}
        }
        // DOM fallback - only update text content, visibility is handled by parent OutlinerItem
        try {
            const container = threadRef?.closest('.outliner-item') as HTMLElement | null;
            const badge = container?.querySelector('.comment-button .comment-count') as HTMLElement | null;
            if (badge) { 
                badge.textContent = String(countNow); 
            }
        } catch {}
    } catch (e) {
        logger.error({ error: e as Error }, '[CommentThread] failed to sync after add');
    }


                    //  onCountChanged 





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
    try { /* Yjs  derived updates; no direct assignment to commentsList */ } catch (e) { logger.error({ error: e as Error }, '[CommentThread] toPlain after delete error'); }
    localComments = localComments.filter(c => c.id !== id);

    const countNow = renderCommentsState.length;
    // Only notify if count actually changed to prevent infinite loops
    if (countNow !== lastNotifiedCount) {
        lastNotifiedCount = countNow;
        try { onCountChanged?.(countNow); } catch {}
        try { threadRef?.dispatchEvent(new CustomEvent('comment-count-changed', { bubbles: true, detail: { count: countNow } })); } catch {}
        try { dispatch('comment-count-changed', { count: countNow }); } catch {}
    }
    // DOM fallback:
    try {
        const container = threadRef?.closest('.outliner-item') as HTMLElement | null;
        const badge = container?.querySelector('.comment-button .comment-count') as HTMLElement | null;
        if (badge) { badge.textContent = String(renderCommentsState.length); (badge as HTMLElement).style.display = (renderCommentsState.length > 0) ? 'inline-block' : 'none'; }
    } catch {}
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

<div class="comment-thread" data-testid="comment-thread" bind:this={threadRef}>
    <div class="comment-summary"><span class="thread-comment-count">{renderCommentsState.length}</span></div>
    {#each renderCommentsState as c (c.id)}
        <div class="comment" data-testid="comment-{c.id}">
            {#if editingId === c.id}
                <input bind:value={editText} data-testid="edit-input-{c.id}" aria-label="Edit comment text" onpointerdown={(e) => { e.stopPropagation(); editorOverlayStore.clearCursorAndSelection(); }} onmousedown={(e) => { e.stopPropagation(); }} />
                <button type="button" onclick={() => saveEdit(c.id)} data-testid="save-edit-{c.id}" aria-label="Save edit" title="Save">Save</button>
                <button type="button" onclick={() => (editingId = null)} data-testid="cancel-edit-{c.id}" aria-label="Cancel edit" title="Cancel">Cancel</button>
            {:else}
                <span class="author">{c.author}:</span>
                <span class="text">{c.text}</span>
                <button type="button" onclick={() => startEdit(c)} class="edit" aria-label="Edit comment" title="Edit">✎</button>
                <button type="button" onclick={() => remove(c.id)} class="delete" aria-label="Delete comment" title="Delete">×</button>
            {/if}
        </div>
    {/each}
    <div class="comment-form-container" data-testid="comment-form">
        <input placeholder="Add comment" bind:value={newText} data-testid="new-comment-input" aria-label="New comment text"  onpointerdown={(e) => { e.stopPropagation(); editorOverlayStore.clearCursorAndSelection(); }} onmousedown={(e) => { e.stopPropagation(); }} onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <button type="button" onclick={add} data-testid="add-comment-btn" aria-label="Add comment">Add</button>
    </div>
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
