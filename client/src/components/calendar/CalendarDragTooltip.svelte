<script lang="ts">
    interface Props {
        label: string;
        clientX: number;
        clientY: number;
    }

    let { label, clientX, clientY }: Props = $props();

    // Offset a few pixels to not cover the pointer
    const tooltipX = $derived(clientX + 16);
    const tooltipY = $derived(clientY + 16);
</script>

<div
    class="calendar-drag-tooltip"
    data-testid="calendar-drag-tooltip"
    style="left: {tooltipX}px; top: {tooltipY}px;"
>
    {label}
</div>

<style>
    .calendar-drag-tooltip {
        position: fixed;
        z-index: 10000;
        pointer-events: none;
        background-color: var(--color-background-elevated);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-m);
        padding: 4px 8px;
        font-size: var(--font-size-s);
        color: var(--color-text-primary);
        box-shadow: var(--shadow-m);
        white-space: nowrap;
        /* Simple viewport clamping */
        max-width: calc(100vw - 32px);
        transform: translate(0, 0);
    }
</style>
