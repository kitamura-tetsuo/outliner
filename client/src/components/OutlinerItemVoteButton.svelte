<script lang="ts">
interface Props {
    voted: boolean;
    count: number;
    truncatedText: string;
    onVote: () => void;
}

let { voted, count, truncatedText, onVote }: Props = $props();
</script>

<button type="button"
    onclick={(e) => { e.stopPropagation(); onVote(); }}
    onpointerdown={(e) => { e.stopPropagation(); }}
    onmousedown={(e) => { e.stopPropagation(); }}
    onmouseup={(e) => { e.stopPropagation(); }}
    class="vote-btn" class:has-count={count > 0}
    class:voted={voted}
    title={voted ? "Remove vote" : "Vote"}
    aria-label={voted ? "Remove vote from: " + truncatedText : "Vote for item: " + truncatedText}
    aria-pressed={voted}
>
    <svg width="16" height="16" viewBox="0 0 24 24" fill={voted ? "currentColor" : "none"} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
    </svg>
</button>

<style>
button {
    background: none;
    border: none;
    padding: 2px 4px;
    cursor: pointer;
    font-size: 0.8rem;
    color: #666;
    border-radius: 3px;
    opacity: 0;
    transition: opacity 0.2s;
}

button:hover {
    background-color: #f0f0f0;
}

button:focus-visible {
    background-color: #f0f0f0;
    outline: 2px solid #0078d7;
    outline-offset: -2px;
}

button.voted {
    color: gold;
}

:global(.outliner-item:hover) button,
:global(.outliner-item:focus-within) button {
    opacity: 1;
}

button.has-count {
    opacity: 1;
}
</style>
