<script lang="ts">
    interface Props {
        label: string;
        clientX: number;
        clientY: number;
    }

    let { label, clientX, clientY }: Props = $props();

    // Small offset to avoid the pointer
    const OFFSET_X = 12;
    const OFFSET_Y = 12;

    let tooltipWidth = $state(0);
    let tooltipHeight = $state(0);
    let windowWidth = $state(0);
    let windowHeight = $state(0);

    // Clamping logic
    let left = $derived(Math.min(Math.max(0, clientX + OFFSET_X), windowWidth - tooltipWidth));
    let top = $derived(Math.min(Math.max(0, clientY + OFFSET_Y), windowHeight - tooltipHeight));
</script>

<svelte:window bind:innerWidth={windowWidth} bind:innerHeight={windowHeight} />

<div
    bind:clientWidth={tooltipWidth}
    bind:clientHeight={tooltipHeight}
    class="calendar-drag-tooltip"
    style="left: {left}px; top: {top}px;"
    data-testid="calendar-drag-tooltip"
>
    {label}
</div>

<style>
    .calendar-drag-tooltip {
        position: fixed;
        z-index: 10000;
        pointer-events: none;
        background-color: var(--bg-primary);
        color: var(--text-primary);
        border: 1px solid var(--border-primary);
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 12px;
        white-space: nowrap;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        will-change: left, top;
    }
</style>
