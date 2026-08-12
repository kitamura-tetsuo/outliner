<script lang="ts">
interface Props {
    count: number;
    title?: string;
    ariaLabel?: string;
    voted: boolean;
    onToggle: () => void;
}

let { count, title, ariaLabel, voted, onToggle }: Props = $props();
</script>

<button type="button"
    class="vote-count"
    {title}
    aria-pressed={voted}
    onclick={(e) => { e.stopPropagation(); onToggle(); }}
    onpointerdown={(e) => { e.stopPropagation(); }}
    onmousedown={(e) => { e.stopPropagation(); }}
    onmouseup={(e) => { e.stopPropagation(); }}
><span aria-hidden="true">{count}</span><span class="sr-only">{ariaLabel}</span></button>

<style>
.vote-count {
    margin-left: 4px;
    background: #f0f0f0;
    border-radius: 8px;
    padding: 0 4px;
    font-size: 0.7rem;
    color: #666;
    border: none;
    cursor: pointer;
}

.vote-count:hover {
    background: #e0e0e0;
}

.vote-count[aria-pressed="true"] {
    background-color: #e3f2fd;
    color: #1976d2;
}
</style>
