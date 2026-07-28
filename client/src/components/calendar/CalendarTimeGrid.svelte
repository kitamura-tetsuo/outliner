<script lang="ts">
// Day / multi-day / week time-grid view (#4347): hour rows down the y axis,
// one column per visible day. Shared by the "day", "days" and "week"
// viewTypes — only the day count and week-start alignment differ, which the
// parent already resolved into `layout` (calendarTimeGridLayout.ts) before
// this component ever mounts.
//
// Drag moves an entry's start (vertical = time-of-day, horizontal = day);
// the resize handle changes only its duration. Both go through the same
// optimistic-placement/writability contract the parent supplies — this
// component never writes Yjs itself, it only reports "moved to instant X" /
// "resized to length Y" and lets the parent decide whether that write is
// allowed and how to reconcile it.

import { onMount } from "svelte";
import type { CalendarEntry } from "../../services/calendar/calendarEntries";
import type { TimeGridLayout } from "../../services/calendar/calendarTimeGridLayout";

const DAY_MS = 86_400_000;
const MIN_DURATION_MS = 5 * 60 * 1000;
const ROW_HEIGHT_PX = 48; // pixels per hour

interface Props {
    layout: TimeGridLayout;
    rangeStart: number;
    workingHoursStartMinutes: number;
    workingHoursEndMinutes: number;
    isStartWritable: (entry: CalendarEntry) => boolean;
    isDurationWritable: (entry: CalendarEntry) => boolean;
    onDragMove: (entry: CalendarEntry, newStartMs: number) => void;
    onDragEnd: (entry: CalendarEntry, newStartMs: number) => void;
    onDragCancel: (entry: CalendarEntry) => void;
    onResizeMove: (entry: CalendarEntry, newDurationMs: number) => void;
    onResizeEnd: (entry: CalendarEntry, newDurationMs: number) => void;
    onKeyboardMove: (entry: CalendarEntry, newStartMs: number) => void;
}

let {
    layout,
    rangeStart,
    workingHoursStartMinutes,
    workingHoursEndMinutes,
    isStartWritable,
    isDurationWritable,
    onDragMove,
    onDragEnd,
    onDragCancel,
    onResizeMove,
    onResizeEnd,
    onKeyboardMove,
}: Props = $props();

const dayHeightPx = 24 * ROW_HEIGHT_PX;
const hours = Array.from({ length: 24 }, (_, i) => i);

let gridEl: HTMLDivElement | undefined = $state();
let scrollEl: HTMLDivElement | undefined = $state();

let drag: {
    kind: "move" | "resize";
    entry: CalendarEntry;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    originStartMs: number;
    originDurationMs: number;
} | undefined;

function columnWidthPx(): number {
    if (!gridEl || layout.dayCount === 0) return 0;
    return gridEl.getBoundingClientRect().width / layout.dayCount;
}

function beginDrag(kind: "move" | "resize", entry: CalendarEntry, e: PointerEvent) {
    if (kind === "move" && !isStartWritable(entry)) return;
    if (kind === "resize" && !isDurationWritable(entry)) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = {
        kind,
        entry,
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        originStartMs: entry.startMs ?? rangeStart,
        originDurationMs: entry.durationMs ?? MIN_DURATION_MS,
    };
}

function onPointerMove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const colWidth = columnWidthPx();
    const dyMinutes = ((e.clientY - drag.startClientY) / ROW_HEIGHT_PX) * 60;

    if (drag.kind === "resize") {
        const newDuration = Math.max(MIN_DURATION_MS, drag.originDurationMs + dyMinutes * 60_000);
        onResizeMove(drag.entry, newDuration);
        return;
    }

    const dxDays = colWidth > 0 ? Math.round((e.clientX - drag.startClientX) / colWidth) : 0;
    const newStart = drag.originStartMs + dxDays * DAY_MS + Math.round(dyMinutes) * 60_000;
    onDragMove(drag.entry, newStart);
}

function onPointerUp(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const colWidth = columnWidthPx();
    const dyMinutes = ((e.clientY - drag.startClientY) / ROW_HEIGHT_PX) * 60;

    if (drag.kind === "resize") {
        const newDuration = Math.max(MIN_DURATION_MS, drag.originDurationMs + dyMinutes * 60_000);
        onResizeEnd(drag.entry, newDuration);
    } else {
        const dxDays = colWidth > 0 ? Math.round((e.clientX - drag.startClientX) / colWidth) : 0;
        const newStart = drag.originStartMs + dxDays * DAY_MS + Math.round(dyMinutes) * 60_000;
        onDragEnd(drag.entry, newStart);
    }
    drag = undefined;
}

function onPointerCancel(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    onDragCancel(drag.entry);
    drag = undefined;
}

/** Arrow-key moves: Up/Down = 15 minutes, Left/Right = 1 day. Immediate, one write per press. */
function onEntryKeydown(entry: CalendarEntry, e: KeyboardEvent) {
    if (!isStartWritable(entry) || entry.startMs === undefined) return;
    let deltaMs;
    if (e.key === "ArrowUp") deltaMs = -15 * 60_000;
    else if (e.key === "ArrowDown") deltaMs = 15 * 60_000;
    else if (e.key === "ArrowLeft") deltaMs = -DAY_MS;
    else if (e.key === "ArrowRight") deltaMs = DAY_MS;
    else return;
    e.preventDefault();
    onKeyboardMove(entry, entry.startMs + deltaMs);
}

onMount(() => {
    // Scroll to the start of the working-hours band on open; a user who
    // scrolls away afterward is never re-snapped (no reactive re-scroll).
    if (scrollEl) scrollEl.scrollTop = Math.max(0, (workingHoursStartMinutes / 60) * ROW_HEIGHT_PX - ROW_HEIGHT_PX);
});
</script>

<svelte:window onpointermove={onPointerMove} onpointerup={onPointerUp} onpointercancel={onPointerCancel} />

<div class="time-grid" data-testid="calendar-time-grid">
    {#if layout.allDay.length > 0 || layout.milestones.length > 0}
        <div class="band-row" data-testid="calendar-all-day-band" style={`grid-template-columns: repeat(${layout.dayCount}, 1fr)`}>
            {#each layout.allDay as p (p.entry.key)}
                <div
                    class="all-day-entry"
                    class:not-writable={!isStartWritable(p.entry)}
                    style={`grid-column: ${p.dayIndex + 1} / span ${p.spanDays}`}
                    data-testid={`calendar-entry-allday-${p.entry.key}`}
                >
                    {p.entry.title}
                </div>
            {/each}
            {#each layout.milestones as m (m.entry.key)}
                <div
                    class="milestone-entry"
                    style={`grid-column: ${m.dayIndex + 1}`}
                    data-testid={`calendar-entry-milestone-${m.entry.key}`}
                >
                    ◆ {m.entry.title}
                </div>
            {/each}
        </div>
    {/if}

    <div class="scroll-area" bind:this={scrollEl} data-testid="calendar-time-grid-scroll">
        <div class="hour-gutter">
            {#each hours as h (h)}
                <div class="hour-label" style={`height: ${ROW_HEIGHT_PX}px`}>{String(h).padStart(2, "0")}:00</div>
            {/each}
        </div>
        <div class="day-columns" bind:this={gridEl} style={`height: ${dayHeightPx}px`}>
            {#each { length: layout.dayCount } as _, dayIndex (dayIndex)}
                <div
                    class="day-column"
                    data-testid={`calendar-day-column-${dayIndex}`}
                    style={`left: ${(dayIndex / layout.dayCount) * 100}%; width: ${100 / layout.dayCount}%`}
                >
                    <div
                        class="working-hours-band"
                        style={`top: ${(workingHoursStartMinutes / 60) * ROW_HEIGHT_PX}px; height: ${
                            ((workingHoursEndMinutes - workingHoursStartMinutes) / 60) * ROW_HEIGHT_PX
                        }px`}
                    ></div>
                </div>
            {/each}
            {#each layout.timed as p (p.entry.key)}
                <div
                    role="button"
                    tabindex="0"
                    class="timed-entry"
                    class:not-writable={!isStartWritable(p.entry)}
                    data-testid={`calendar-entry-${p.entry.key}`}
                    style={`left: calc(${(p.dayIndex / layout.dayCount) * 100}% + ${
                        (p.columnIndex / p.columnCount) * (100 / layout.dayCount)
                    }%); width: calc(${100 / layout.dayCount / p.columnCount}% - 2px); top: ${
                        p.startFraction * dayHeightPx
                    }px; height: ${(p.endFraction - p.startFraction) * dayHeightPx}px`}
                    onpointerdown={(e) => beginDrag("move", p.entry, e)}
                    onkeydown={(e) => onEntryKeydown(p.entry, e)}
                >
                    <span class="entry-title">{p.entry.title}</span>
                    {#if isDurationWritable(p.entry)}
                        <div
                            role="separator"
                            aria-label={`Resize ${p.entry.title}`}
                            class="resize-handle"
                            data-testid={`calendar-entry-resize-${p.entry.key}`}
                            onpointerdown={(e) => beginDrag("resize", p.entry, e)}
                        ></div>
                    {/if}
                </div>
            {/each}
        </div>
    </div>
</div>

<style>
.time-grid {
    display: flex;
    flex-direction: column;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
}

.band-row {
    display: grid;
    gap: 2px;
    padding: 4px;
    border-bottom: 1px solid #e5e7eb;
    background: #f9fafb;
}

.all-day-entry,
.milestone-entry {
    background: #dbeafe;
    color: #1e3a8a;
    border-radius: 3px;
    padding: 2px 6px;
    font-size: 0.75rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.milestone-entry {
    background: transparent;
    color: #b45309;
}

.not-writable {
    opacity: 0.7;
    cursor: default;
}

.scroll-area {
    display: flex;
    max-height: 480px;
    overflow-y: auto;
    position: relative;
}

.hour-gutter {
    flex: none;
    width: 3.5rem;
    text-align: right;
    padding-right: 4px;
    color: #9ca3af;
    font-size: 0.7rem;
}

.hour-label {
    box-sizing: border-box;
    border-top: 1px solid #f3f4f6;
}

.day-columns {
    position: relative;
    flex: 1;
}

.day-column {
    position: absolute;
    top: 0;
    bottom: 0;
    border-left: 1px solid #f3f4f6;
    box-sizing: border-box;
}

.working-hours-band {
    position: absolute;
    left: 0;
    right: 0;
    background: #f9fafb;
}

.timed-entry {
    position: absolute;
    background: #2563eb;
    color: white;
    border-radius: 3px;
    font-size: 0.75rem;
    padding: 2px 4px;
    overflow: hidden;
    box-sizing: border-box;
    cursor: grab;
    touch-action: none;
}

.timed-entry.not-writable {
    background: #9ca3af;
    cursor: default;
}

.entry-title {
    pointer-events: none;
}

.resize-handle {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 6px;
    cursor: ns-resize;
    touch-action: none;
}
</style>
