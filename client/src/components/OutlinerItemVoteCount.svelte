<script lang="ts">
interface Props {
    count: number;
    title?: string;
    ariaLabel?: string;
}

let { count, title, ariaLabel }: Props = $props();
</script>

<span
    class="vote-count"
    {title}
><span aria-hidden="true">{count}</span><span class="sr-only">{ariaLabel}</span></span>

<style>
.vote-count {
    margin-left: 4px;
    background: #f0f0f0;
    border-radius: 8px;
    padding: 0 4px;
    font-size: 0.7rem;
    color: #666;
}
</style>
