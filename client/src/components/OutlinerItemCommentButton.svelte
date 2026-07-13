<script lang="ts">
interface Props {
    modelId: string;
    commentCount: number;
    isVisible: boolean;
    onToggle: () => void;
}

let { modelId, commentCount, isVisible, onToggle }: Props = $props();
</script>

<span class="comment-count-visual" class:has-count={commentCount > 0} aria-hidden="true">{commentCount}</span>
<button type="button"
    class="comment-button" class:has-count={commentCount > 0}
    data-testid="comment-button-{modelId}"
    draggable="false"
    onclick={(e) => { e.stopPropagation(); onToggle(); }}
    onpointerdown={(e) => { e.stopPropagation(); }}
    onmousedown={(e) => { e.stopPropagation(); }}
    onmouseup={(e) => { e.stopPropagation(); }}
    aria-label={isVisible ? "Close comments" : `Open comments (${commentCount})`}
    aria-expanded={isVisible}
>
    <span class="comment-icon">💬</span>
    <span class="comment-count">{commentCount}</span>
</button>

<style>
.comment-button,
.comment-count-visual {
    opacity: 0;
    transition: opacity 0.2s;
}

:global(.outliner-item:hover) .comment-button,
:global(.outliner-item:focus-within) .comment-button,
:global(.outliner-item:hover) .comment-count-visual,
:global(.outliner-item:focus-within) .comment-count-visual,
.comment-button.has-count,
.comment-count-visual.has-count {
    opacity: 1;
}

.comment-count {
    background-color: #e3f2fd;
    color: #1976d2;
    border-radius: 10px;
    padding: 2px 6px;
    font-size: 0.75rem;
    margin-left: 4px;
    display: inline-block;
}

.comment-button {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.9rem;
    margin-left: 4px;
    padding: 2px 4px;
    border-radius: 3px;
}

.comment-button:hover {
    background-color: #f0f0f0;
}

/* On mobile, don't permanently reserve a line of height under every item for a
   control that's invisible most of the time - collapse it out of the layout
   until the item is actively focused (or it has comments to show). */
@media (max-width: 768px) {
    .comment-button,
    .comment-count-visual {
        display: none;
    }

    /* Editing state is tracked via data-active (the global textarea, not a
       per-item element, holds real DOM focus, so :focus-within never fires
       here) - see OutlinerItem.svelte's isItemActive. */
    :global(.outliner-item:hover) .comment-button,
    :global(.outliner-item[data-active="true"]) .comment-button,
    .comment-button.has-count {
        display: inline-block;
    }

    :global(.outliner-item:hover) .comment-count-visual,
    :global(.outliner-item[data-active="true"]) .comment-count-visual,
    .comment-count-visual.has-count {
        display: inline;
    }
}
</style>
