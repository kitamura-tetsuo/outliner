<script lang="ts">
interface Props {
    count: number;
    title?: string;
    ariaLabel?: string;
}

let { count, title, ariaLabel }: Props = $props();
</script>

<span
    class="vote-count" class:has-count={count > 0}
    {title}
    aria-label={ariaLabel}
>{count}</span>

<style>
.vote-count {
    margin-left: 4px;
    background: #f0f0f0;
    border-radius: 8px;
    padding: 0 4px;
    font-size: 0.7rem;
    color: #666;
    opacity: 0;
    transition: opacity 0.2s;
}

:global(.outliner-item:hover) .vote-count,
:global(.outliner-item:focus-within) .vote-count {
    opacity: 1;
}

.vote-count.has-count {
    opacity: 1;
}
</style>
