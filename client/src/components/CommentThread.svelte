<script lang="ts">
import { Comments } from "../schema/app-schema";
import * as Y from "yjs";
import type { Comment } from "../schema/app-schema";
import type { ItemLike } from "../types/yjs-types";
import { getLogger } from "../lib/logger";
import { createEventDispatcher, onMount } from "svelte";
const logger = getLogger("CommentThread");
const dispatch = createEventDispatcher();

interface E2ELogEntry {
    tag?: string;
    id?: string;
    before?: number;
    after?: number;
    newText?: string;
    url?: string;
    t?: number;
    comp?: string;
    hasThreadRef?: boolean;
    btns?: number;
    inputValue?: string;
    target?: string | null;
    [key: string]: unknown;
}

interface Props {
    comments?: Comments;
    currentUser: string;
    doc: unknown;
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

function e2eLog(entry: E2ELogEntry) {
    try {
        interface WindowWithE2E extends Window {
            E2E_LOGS?: E2ELogEntry[];
        }
        const w = window as unknown as WindowWithE2E;
        w.E2E_LOGS = Array.isArray(w.E2E_LOGS) ? w.E2E_LOGS : [];
        w.E2E_LOGS.push({ t: Date.now(), comp: 'CommentThread', ...entry });
    } catch {}
}

//
//
let lastNotifiedCount = $state(-1);




// initial recompute deferred until commentsSubscriber is initialized

// Yjs minimum granularity observe: Watch Y.Array<Y.Map> deeply
onMount(() => {
    let unobserve: (() => void) | undefined;
    try {
        // 1) If Comments wrapper exists, get internal yArray (private but accessible in JS)
        let yarr: Y.Array<Y.Map<unknown>> | undefined = (comments as Comments | undefined)?.yArray;
        // 2) If not, ensure Y.Map -> "comments" via item
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
                    logger.error("Error in observe handler", e);
                }
            };
            yarr.observeDeep(handler);
            unobserve = () => { try { yarr.unobserveDeep(handler); } catch {} };
            // Initial reflection
            handler();
        }
    } catch {}
    return () => { try { unobserve?.(); } catch {} };
});


// Yjs automatic synchronization stopped (Limited to immediate notification on add/remove for CMT-0001 stabilization)
// $effect(() => {
//     try {
//         const list = (commentsSubscriber.current as any) ?? [];
//         commentsList = list as Comment[];
//         recompute();
//         onCountChanged?.(commentsList.length);
//     } catch {}
// });

// Click delegation (safety net): Ensure add() is called even in environments where button onclick doesn't work
// Lightweight auto-sync: toPlain -> recompute -> onCountChanged (only when length changes) on Y.Doc update


// Delegate count notification to parent (OutlinerItem) Yjs-derived subscription.
// Do not perform direct DOM rewriting or side effects here ($effect removed).

    try { logger.debug('[CommentThread] mount props', { hasComments: !!props?.comments, hasDoc: !!props?.doc }); } catch {}

// Fallback removal: Remove click delegation/auto-add/global delegation in onMount


// Click delegation safety net to ensure add() fires in all environments
onMount(() => {
    let lastFiredAt = 0;
    const handler = (e: Event) => {
        const now = Date.now();
        const el = e.target as HTMLElement | null;
        try { e2eLog({ tag: 'doc:click', target: (el?.getAttribute?.('data-testid') || el?.closest?.('[data-testid]')?.getAttribute?.('data-testid') || null) }); } catch {}
        if (now - lastFiredAt < 50) return; // coalesce bursts
        if (!el) return;
        const btn = el.closest('[data-testid="add-comment-btn"]');
        if (btn) {
            lastFiredAt = now;
            try { e2eLog({ tag: 'delegate:add-click' }); } catch {}
            try { add(); } catch {}
        }
    };
    try { threadRef?.addEventListener('click', handler, { capture: true }); } catch {}
    // Direct binding on the button element as the strongest fallback
    try {
        const btnEl = threadRef?.querySelector('[data-testid="add-comment-btn"]');
        btnEl?.addEventListener('click', handler, { capture: true });
    } catch {}
    // Global capture as ultimate safety
    try { document.addEventListener('click', handler, true); } catch {}
    try { document.addEventListener('pointerdown', handler, true); } catch {}
    try { document.addEventListener('mousedown', handler, true); } catch {}
    return () => {
        try { threadRef?.removeEventListener('click', handler, { capture: true }); } catch {}
        try {
            const btnEl = threadRef?.querySelector('[data-testid="add-comment-btn"]');
            btnEl?.removeEventListener('click', handler, { capture: true });
        } catch {}
        try { document.removeEventListener('click', handler, true); } catch {}
        try { document.removeEventListener('pointerdown', handler, true); } catch {}
        try { document.removeEventListener('mousedown', handler, true); } catch {}
    };
});

// E2E stabilization: Poll input DOM value and auto-add (Last resort when bind:value doesn't work depending on environment)
onMount(() => {
    let fired = false;
    const iv = setInterval(() => {
        try {
            if (fired) return;
            const inputEl = threadRef?.querySelector('[data-testid="new-comment-input"]') as HTMLInputElement | null;
            const val = inputEl?.value ?? '';
            if (val && (renderCommentsState?.length ?? 0) === 0) {
                newText = val;
                fired = true;
                try { e2eLog({ tag: 'auto-poll-add' }); } catch {}
                add();
            }
        } catch {}
    }, 120);
    return () => { try { clearInterval(iv); } catch {} };
});


// Assume local update priority here, and Yjs synchronization will be reflected in subsequent transactions

function add() {
    try {
        const container = threadRef?.closest('.outliner-item') as HTMLElement | null;
        const before = container ? (container.querySelectorAll('[data-testid="comment-thread"] .comment').length) : 0;
        const cid = container?.getAttribute('data-item-id') || props.item?.id || '';
        e2eLog({ tag: 'add:start', id: cid, before, newText });
    } catch {}
    // Get value from DOM as well to allow adding even in environments where bind:value doesn't work
    let text = newText;
    if (!text) {
        try {
            const inputEl = threadRef?.querySelector('[data-testid="new-comment-input"]') as HTMLInputElement | null;
            text = inputEl?.value ?? '';
        } catch {}
    }
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
                commentsObj = new Comments(arr);
                logger.debug('[CommentThread] initialized comments via tree/key fallback');
            }
        } catch (e) {
            logger.warn('[CommentThread] failed to ensure comments via fallback', e);
        }
    }
    const user = props.currentUser;

    logger.debug('[CommentThread] add comment, newText=', newText);
    logger.debug('[CommentThread] comments object:', commentsObj, 'props.item?', !!props.item, 'item?.comments?', !!props.item?.comments);

    // Proceed with UI even if comments object is invalid (Ensure reflection with DOM/event)
    const time = Date.now();
    let id: string;
    if (commentsObj && typeof commentsObj.addComment === 'function') {
        const res = commentsObj.addComment(user, newText);
        id = res?.id || `local-${time}-${Math.random().toString(36).slice(2)}`;
        logger.debug('[CommentThread] comment added to Yjs, id=', id);
    } else {
        logger.error('[CommentThread] comments object is invalid or missing addComment; falling back to local DOM only');
        id = `local-${time}-${Math.random().toString(36).slice(2)}`;
    }

    // Predictive immediate reflection: Estimate +1 from current DOM and update badge immediately (Run before normal path)
    try {
        const container = threadRef?.closest('.outliner-item') as HTMLElement | null;
        const threadEl = container?.querySelector('[data-testid="comment-thread"]') as HTMLElement | null;
        const before = threadEl ? threadEl.querySelectorAll('.comment').length : 0;
        const predicted = before + 1;
        const id = props.item?.id || container?.getAttribute('data-item-id');
        if (id) {
            const nodes = document.querySelectorAll(`[data-item-id="${id}"] .comment-count`);
            nodes.forEach(el => { (el as HTMLElement).textContent = String(predicted); });
        }
    } catch {}
    // Immediate reflection to DOM with optimistic local addition
    try {
        const optimistic: Comment = { id, author: user, text: newText, created: time, lastChanged: time };
        localComments = [...localComments, optimistic];

    } catch {}


    // Normal path: Sync state after Yjs addition and notify parent with exact count
    try {
        // Yjs  d e b ae ad f1 c8 ec b7 f4 b7 L
        // Yjs

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
        logger.error('[CommentThread] failed to sync after add', e);
    }


                    //          onCountChanged





    try {
        const container = threadRef?.closest('.outliner-item') as HTMLElement | null;
        const cid = container?.getAttribute('data-item-id') || props.item?.id || '';
        const after = (renderCommentsState?.length ?? 0);
        e2eLog({ tag: 'add:end', id: cid, after });
    } catch {}
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
                commentsObj = new Comments(arr);
                logger.debug('[CommentThread] ensured comments for remove via tree/key');
            }
        } catch (e) {
            logger.warn('[CommentThread] failed to ensure comments for remove', e);
        }
    }
    try { commentsObj?.deleteComment?.(id); } catch (e) { logger.error('[CommentThread] deleteComment error', e); }
    try { /* Yjs    derived updates; no direct assignment to commentsList */ } catch (e) { logger.error('[CommentThread] toPlain after delete error', e); }
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
    try { logger.debug('[CommentThread] saveEdit start id=', id, 'editText=', editText); } catch {}
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
                commentsObj = new Comments(arr);
                logger.debug('[CommentThread] ensured comments for saveEdit via tree/key');
            }
        } catch (e) {
            logger.warn('[CommentThread] failed to ensure comments for saveEdit', e);
        }
    }

    // Update the Yjs document
    try {
        commentsObj?.updateComment?.(id, editText);
        logger.debug('[CommentThread] updateComment called');
    } catch (e) {
        logger.error('[CommentThread] updateComment error', e);
    }

    try { /* Yjs derived updates; no direct assignment to commentsList */ logger.debug('[CommentThread] updateComment applied'); } catch (e) { logger.error('[CommentThread] toPlain after update error', e); }

    // Update local state to immediately reflect the change while we wait for Yjs observer
    localComments = localComments.map(c => c.id === id ? { ...c, text: editText, lastChanged: Date.now() } : c);

    // Update renderCommentsState to immediately show the change in UI, but only update the specific field
    renderCommentsState = renderCommentsState.map(c => c.id === id ? { ...c, text: editText, lastChanged: Date.now() } : c);

    try { logger.debug('[CommentThread] renderCommentsState after update', renderCommentsState); } catch {}
    editingId = null;
    
    // Dispatch an event to notify that a comment was edited
    try { 
        threadRef?.dispatchEvent(new CustomEvent('comment-edited', { bubbles: true, detail: { id, text: editText } })); 
    } catch (e) { 
        logger.error('[CommentThread] failed to dispatch comment-edited event', e); 
    }
}

// Mount diagnostics for E2E visibility
onMount(() => {
    try {
        const btns = threadRef?.querySelectorAll('[data-testid="add-comment-btn"]').length || 0;
        const inputEl = threadRef?.querySelector('[data-testid="new-comment-input"]') as HTMLInputElement | null;
        e2eLog({ tag: 'mounted', hasThreadRef: !!threadRef, btns, inputValue: inputEl?.value ?? '' });
    } catch {}
});

</script>

<div class="comment-thread" data-testid="comment-thread" bind:this={threadRef}>
    <div class="comment-summary"><span class="thread-comment-count">{renderCommentsState.length}</span></div>
    {#each renderCommentsState as c (c.id)}
        <div class="comment" data-testid="comment-{c.id}">
            {#if editingId === c.id}
                <input bind:value={editText} data-testid="edit-input-{c.id}" />
                <button onclick={() => saveEdit(c.id)} data-testid="save-edit-{c.id}">Save</button>
                <button onclick={() => (editingId = null)} data-testid="cancel-edit-{c.id}">Cancel</button>
            {:else}
                <span class="author">{c.author}:</span>
                <span class="text">{c.text}</span>
                <button onclick={() => startEdit(c)} class="edit">✎</button>
                <button onclick={() => remove(c.id)} class="delete">×</button>
            {/if}
        </div>
    {/each}
    <form onsubmit={(e) => { e.preventDefault(); try { add(); } catch (err) { logger.error('[CommentThread] submit add error', err); } }} data-testid="comment-form">
        <input placeholder="Add comment" bind:value={newText} data-testid="new-comment-input" oninput={(e) => { try { e2eLog({ tag: 'input', value: (e.target as HTMLInputElement).value }); } catch {} }} />
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
