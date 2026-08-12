<script lang="ts">
interface Props {
    count: number;
    title?: string;
    ariaLabel?: string;
    voted?: boolean;
    onToggleVote?: () => void;
}

let { count, title, ariaLabel, voted = false, onToggleVote }: Props = $props();

function preventEditorBlur(e: PointerEvent) {
    if (e.pointerType === "mouse") {
        e.preventDefault();
    }
}
</script>

<button
    type="button"
    class="vote-count" class:has-count={count > 0} class:voted
    {title}
    aria-label={ariaLabel}
    aria-pressed={voted}
    data-keep-editor-focus
    onpointerdown={preventEditorBlur}
    onclick={onToggleVote}
>{count}</button>

<style>
.vote-count {
    margin-left: 4px;
    background: #f0f0f0;
    border: none;
    border-radius: 8px;
    padding: 0 4px;
    font-size: 0.7rem;
    color: #666;
    opacity: 0;
    transition: opacity 0.2s, background-color 0.2s, color 0.2s;
    cursor: pointer;
    line-height: inherit;
    font-family: inherit;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

.vote-count:hover {
    background: #e0e0e0;
}

.vote-count.voted {
    background: #e3f2fd;
    color: #1976d2;
}

.vote-count.voted:hover {
    background: #bbdefb;
}

:global(.outliner-item:hover) .vote-count,
:global(.outliner-item:focus-within) .vote-count {
    opacity: 1;
}

.vote-count.has-count {
    opacity: 1;
}
</style>
