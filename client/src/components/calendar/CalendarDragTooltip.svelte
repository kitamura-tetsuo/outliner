<script lang="ts">
// The destination chip shown while a calendar entry is being dragged or
// resized (#4535). Purely presentational: the grid that owns the drag has
// already computed the snapped label (calendarDragLabel.ts) and the pointer
// position, so this component only positions the chip and keeps it inside
// the viewport.
//
// `pointer-events: none` is essential, not cosmetic — the chip follows the
// pointer, so anything else would make it swallow the very `pointermove` /
// `drop` events the drag depends on.

interface Props {
    label: string;
    clientX: number;
    clientY: number;
}

let { label, clientX, clientY }: Props = $props();

const OFFSET_PX = 14;
const MARGIN_PX = 4;

let tooltipWidth = $state(0);
let tooltipHeight = $state(0);
let windowWidth = $state(0);
let windowHeight = $state(0);

// Clamp against the measured chip size so a drag near the right/bottom edge
// keeps the whole label readable instead of running off-screen. Before the
// first measurement both sizes are 0, which degrades to "offset from the
// pointer" — the same place the clamped value lands in the common case.
const left = $derived(Math.max(MARGIN_PX, Math.min(clientX + OFFSET_PX, windowWidth - tooltipWidth - MARGIN_PX)));
const top = $derived(Math.max(MARGIN_PX, Math.min(clientY + OFFSET_PX, windowHeight - tooltipHeight - MARGIN_PX)));
</script>

<svelte:window bind:innerWidth={windowWidth} bind:innerHeight={windowHeight} />

<div
    bind:clientWidth={tooltipWidth}
    bind:clientHeight={tooltipHeight}
    class="calendar-drag-tooltip"
    style={`left: ${left}px; top: ${top}px`}
    data-testid="calendar-drag-tooltip"
>
    {label}
</div>

<style>
.calendar-drag-tooltip {
    position: fixed;
    z-index: 1000;
    pointer-events: none;
    background: #111827;
    color: #f9fafb;
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 0.75rem;
    line-height: 1.4;
    white-space: nowrap;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
}
</style>
