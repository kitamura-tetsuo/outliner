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
//
// The optional lane handle (#4348) is a *separate* small element, deliberately
// not the entry body itself: the body's `pointerdown` already calls
// `setPointerCapture` for the reschedule drag above, which would suppress the
// browser's native HTML5 drag-and-drop the moment both lived on the same
// node. A dedicated `draggable` handle lets `CalendarLaneTimeGrid.svelte`
// implement cross-lane drops with native DnD (mirroring `CalendarMonthGrid`'s
// existing pattern) without touching reschedule at all.

import { onMount } from "svelte";
import type { DayHeader } from "../../services/calendar/calendarDayHeaders";
import { formatDragMoveLabel, formatDragResizeLabel, formatDuration } from "../../services/calendar/calendarDragLabel";
import type { CalendarEntry } from "../../services/calendar/calendarEntries";
import type { TimeGridLayout } from "../../services/calendar/calendarTimeGridLayout";
import CalendarDragTooltip from "./CalendarDragTooltip.svelte";

const DAY_MS = 86_400_000;
const MIN_DURATION_MS = 5 * 60 * 1000;
const ROW_HEIGHT_PX = 48; // pixels per hour
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Props {
    layout: TimeGridLayout;
    rangeStart: number;
    workingHoursStartMinutes: number;
    workingHoursEndMinutes: number;
    dayHeaders?: DayHeader[];
    todayUtcMs?: number;
    /** The calendar's own timezone (§6.5) — the drag tooltip formats in it, never viewer-local. */
    timeZone: string;
    isStartWritable: (entry: CalendarEntry) => boolean;
    isDurationWritable: (entry: CalendarEntry) => boolean;
    onDragMove: (entry: CalendarEntry, newStartMs: number) => void;
    onDragEnd: (entry: CalendarEntry, newStartMs: number) => void;
    onDragCancel: (entry: CalendarEntry) => void;
    onResizeMove: (entry: CalendarEntry, newDurationMs: number) => void;
    onResizeEnd: (entry: CalendarEntry, newDurationMs: number) => void;
    onKeyboardMove: (entry: CalendarEntry, newStartMs: number) => void;
    onKeyboardResize: (entry: CalendarEntry, newDurationMs: number) => void;
    /** Requests the delete-disposition prompt for an entry; addressability (not writability) gates this. */
    onDeleteRequest?: (entry: CalendarEntry) => void;
    isDeletable?: (entry: CalendarEntry) => boolean;
    /** Present only when this grid is one lane band of `CalendarLaneTimeGrid.svelte` (#4348). */
    isLaneWritable?: (entry: CalendarEntry) => boolean;
    onLaneDragStart?: (entry: CalendarEntry, e: DragEvent) => void;
}

let {
    layout,
    rangeStart,
    workingHoursStartMinutes,
    workingHoursEndMinutes,
    dayHeaders,
    todayUtcMs,
    timeZone,
    isStartWritable,
    isDurationWritable,
    onDragMove,
    onDragEnd,
    onDragCancel,
    onResizeMove,
    onResizeEnd,
    onKeyboardMove,
    onKeyboardResize,
    onDeleteRequest,
    isDeletable = () => false,
    isLaneWritable,
    onLaneDragStart,
}: Props = $props();

const dayHeightPx = 24 * ROW_HEIGHT_PX;
const hours = Array.from({ length: 24 }, (_, i) => i);

let gridEl: HTMLDivElement | undefined = $state();
let scrollEl: HTMLDivElement | undefined = $state();

let drag = $state<{
    kind: "move" | "resize"
    entry: CalendarEntry
    pointerId: number
    startClientX: number
    startClientY: number
    originStartMs: number
    originDurationMs: number
} | undefined>(undefined);

// Destination tooltip (#4535): the label is the *snapped* value the drag
// would commit right now, so it always agrees with what a release writes.
let dragLabel = $state<string | undefined>(undefined);
let pointerX = $state(0);
let pointerY = $state(0);

function columnWidthPx(): number {
    if (!gridEl || layout.dayCount === 0) return 0;
    return gridEl.getBoundingClientRect().width / layout.dayCount;
}

function beginDrag(kind: "move" | "resize", entry: CalendarEntry, e: PointerEvent) {
    if (kind === "move" && !isStartWritable(entry)) return;
    if (kind === "resize" && !isDurationWritable(entry)) return;
    if (e.pointerType === "mouse") e.preventDefault();
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

/**
 * The snapped duration a resize at `e` would commit. Snapped to whole
 * minutes like the move drag below: at 48px/hour an ordinary pixel offset
 * lands on a fraction of a minute, which would write a duration the
 * (minute-precision) tooltip cannot show.
 */
function resizedDurationMs(e: PointerEvent): number {
    if (!drag) return MIN_DURATION_MS;
    const dyMinutes = ((e.clientY - drag.startClientY) / ROW_HEIGHT_PX) * 60;
    const minutes = Math.round((drag.originDurationMs + dyMinutes * 60_000) / 60_000);
    return Math.max(MIN_DURATION_MS, minutes * 60_000);
}

/** The snapped start a move at `e` would commit (whole minutes, whole day columns). */
function movedStartMs(e: PointerEvent): number {
    if (!drag) return rangeStart;
    const colWidth = columnWidthPx();
    const dyMinutes = ((e.clientY - drag.startClientY) / ROW_HEIGHT_PX) * 60;
    const dxDays = colWidth > 0 ? Math.round((e.clientX - drag.startClientX) / colWidth) : 0;
    return drag.originStartMs + dxDays * DAY_MS + Math.round(dyMinutes) * 60_000;
}

function onPointerMove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    pointerX = e.clientX;
    pointerY = e.clientY;

    if (drag.kind === "resize") {
        const newDuration = resizedDurationMs(e);
        dragLabel = formatDragResizeLabel(drag.entry, newDuration, timeZone);
        onResizeMove(drag.entry, newDuration);
        return;
    }

    const newStart = movedStartMs(e);
    dragLabel = formatDragMoveLabel(drag.entry, newStart, timeZone);
    onDragMove(drag.entry, newStart);
}

function onPointerUp(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;

    if (drag.kind === "resize") {
        onResizeEnd(drag.entry, resizedDurationMs(e));
    } else {
        onDragEnd(drag.entry, movedStartMs(e));
    }
    drag = undefined;
    dragLabel = undefined;
}

function onPointerCancel(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    onDragCancel(drag.entry);
    drag = undefined;
    dragLabel = undefined;
}

function keyToDeltaMs(key: string): number | undefined {
    if (key === "ArrowUp") return -15 * 60_000;
    if (key === "ArrowDown") return 15 * 60_000;
    if (key === "ArrowLeft") return -DAY_MS;
    if (key === "ArrowRight") return DAY_MS;
    return undefined;
}

/** Arrow-key moves: Up/Down = 15 minutes, Left/Right = 1 day. Immediate, one write per press. */
function onEntryKeydown(entry: CalendarEntry, e: KeyboardEvent) {
    if ((e.key === "Delete" || e.key === "Backspace") && isDeletable(entry)) {
        e.preventDefault();
        onDeleteRequest?.(entry);
        return;
    }
    if (!isStartWritable(entry) || entry.startMs === undefined) return;
    const deltaMs = keyToDeltaMs(e.key);
    if (deltaMs === undefined) return;
    e.preventDefault();
    onKeyboardMove(entry, entry.startMs + deltaMs);
}

function onResizeKeydown(entry: CalendarEntry, e: KeyboardEvent) {
    if (!isDurationWritable(entry)) return;
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    e.stopPropagation(); // prevent bubbling to onEntryKeydown

    const deltaMs = e.key === "ArrowUp" ? -15 * 60_000 : 15 * 60_000;
    const currentDurationMs = entry.durationMs ?? MIN_DURATION_MS;
    const newDurationMs = Math.max(MIN_DURATION_MS, currentDurationMs + deltaMs);

    onKeyboardResize(entry, newDurationMs);
}

onMount(() => {
    // Scroll to the start of the working-hours band on open; a user who
    // scrolls away afterward is never re-snapped (no reactive re-scroll).
    if (scrollEl) scrollEl.scrollTop = Math.max(0, (workingHoursStartMinutes / 60) * ROW_HEIGHT_PX - ROW_HEIGHT_PX);
});
</script>

<svelte:window onpointermove={onPointerMove} onpointerup={onPointerUp} onpointercancel={onPointerCancel} />

<div class="time-grid" class:dragging={drag !== undefined} data-testid="calendar-time-grid">
    {#if dayHeaders}
        <div class="day-header-row" data-testid="calendar-day-header-row">
            <div class="hour-gutter"></div>
            <div class="day-headers-band" style={`grid-template-columns: repeat(${layout.dayCount}, 1fr)`}>
                {#each dayHeaders as header (header.dayIndex)}
                    <div
                        class="day-header-cell"
                        class:is-today={header.dateUtcMs === todayUtcMs}
                        class:is-weekend={header.weekday === 0 || header.weekday === 6}
                        data-testid={`calendar-day-header-${header.dayIndex}`}
                        data-date={header.isoDate}
                    >
                        {WEEKDAY_LABELS[header.weekday]} {header.dayOfMonth}
                    </div>
                {/each}
            </div>
        </div>
    {/if}

    {#if layout.allDay.length > 0 || layout.milestones.length > 0}
        <div class="band-row" data-testid="calendar-all-day-band" style={`grid-template-columns: repeat(${layout.dayCount}, 1fr)`}>
            {#each layout.allDay as p (p.entry.key)}
                <div
                    role="button"
                    tabindex="0"
                    class="all-day-entry"
                    class:not-writable={!isStartWritable(p.entry)}
                    style={`grid-column: ${p.dayIndex + 1} / span ${p.spanDays}`}
                    data-testid={`calendar-entry-allday-${p.entry.key}`}
                    onkeydown={(e) => onEntryKeydown(p.entry, e)}
                >
                    <span class="entry-title" data-testid="calendar-entry-title">{p.entry.title}</span>
                    {#if isDeletable(p.entry)}
                        <button
                            type="button"
                            class="delete-button"
                            aria-label={`Delete ${p.entry.title}`}
                            data-testid={`calendar-entry-delete-${p.entry.key}`}
                            onclick={(e) => {
                                e.stopPropagation();
                                onDeleteRequest?.(p.entry);
                            }}
                        >×</button>
                    {/if}
                </div>
            {/each}
            {#each layout.milestones as m (m.entry.key)}
                <div
                    role="button"
                    tabindex="0"
                    class="milestone-entry"
                    style={`grid-column: ${m.dayIndex + 1}`}
                    data-testid={`calendar-entry-milestone-${m.entry.key}`}
                    onkeydown={(e) => onEntryKeydown(m.entry, e)}
                >
                    <span class="entry-title" data-testid="calendar-entry-title">◆ {m.entry.title}</span>
                    {#if isDeletable(m.entry)}
                        <button
                            type="button"
                            class="delete-button"
                            aria-label={`Delete ${m.entry.title}`}
                            data-testid={`calendar-entry-delete-${m.entry.key}`}
                            onclick={(e) => {
                                e.stopPropagation();
                                onDeleteRequest?.(m.entry);
                            }}
                        >×</button>
                    {/if}
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
                    <span class="entry-title" data-testid="calendar-entry-title">{p.entry.title}</span>
                    {#if isDeletable(p.entry)}
                        <button
                            type="button"
                            class="delete-button"
                            aria-label={`Delete ${p.entry.title}`}
                            data-testid={`calendar-entry-delete-${p.entry.key}`}
                            onpointerdown={(e) => e.stopPropagation()}
                            onclick={(e) => {
                                e.stopPropagation();
                                onDeleteRequest?.(p.entry);
                            }}
                        >×</button>
                    {/if}
                    {#if isDurationWritable(p.entry)}
                        <div
                            role="separator"
                            tabindex="0"
                            aria-orientation="horizontal"
                            aria-valuemin={MIN_DURATION_MS / 60000}
                            aria-valuenow={(p.entry.durationMs ?? MIN_DURATION_MS) / 60000}
                            aria-valuetext={formatDuration(p.entry.durationMs ?? MIN_DURATION_MS)}
                            aria-label={`Resize ${p.entry.title}`}
                            class="resize-handle"
                            data-testid={`calendar-entry-resize-${p.entry.key}`}
                            onpointerdown={(e) => beginDrag("resize", p.entry, e)}
                            onkeydown={(e) => onResizeKeydown(p.entry, e)}
                        ></div>
                    {/if}
                    {#if isLaneWritable?.(p.entry)}
                        <div
                            role="button"
                            tabindex="-1"
                            aria-label={`Move ${p.entry.title} to another lane`}
                            class="lane-handle"
                            draggable="true"
                            data-testid={`calendar-entry-lane-handle-${p.entry.key}`}
                            ondragstart={(e) => onLaneDragStart?.(p.entry, e)}
                        >⠿</div>
                    {/if}
                </div>
            {/each}
        </div>
    </div>
</div>

{#if dragLabel}
    <CalendarDragTooltip label={dragLabel} clientX={pointerX} clientY={pointerY} />
{/if}

<style>
:global(.dragging), :global(.dragging *) {
    -webkit-user-select: none !important;
    user-select: none !important;
}

.time-grid {
    display: flex;
    flex-direction: column;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    overflow: clip;
}

.day-header-row {
    position: sticky;
    top: 0;
    z-index: 1;
    background: #fff;
    display: flex;
    border-bottom: 1px solid #e5e7eb;
}

.day-headers-band {
    display: grid;
    flex: 1;
}

.day-header-cell {
    padding: 6px;
    font-size: 0.75rem;
    font-weight: 600;
    color: #374151;
    text-align: center;
    border-left: 1px solid transparent; /* Align with column borders */
}

.day-header-cell:first-child {
    border-left: none;
}

.day-header-cell.is-weekend {
    color: #9ca3af;
}

.day-header-cell.is-today {
    color: #2563eb;
    font-weight: 700;
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
    -webkit-user-select: none;
    user-select: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    background: #dbeafe;
    color: #1e3a8a;
    border-radius: 3px;
    padding: 2px 6px;
    font-size: 0.75rem;
    overflow: hidden;
}

.all-day-entry .entry-title,
.milestone-entry .entry-title {
    pointer-events: auto;
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
    -webkit-user-select: none;
    user-select: none;
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
    -webkit-user-select: none;
    user-select: none;
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 6px;
    cursor: ns-resize;
    touch-action: none;
}

.delete-button {
    flex: none;
    border: none;
    background: transparent;
    color: inherit;
    opacity: 0.75;
    cursor: pointer;
    font-size: 0.85rem;
    line-height: 1;
    padding: 0 2px;
}

.delete-button:hover {
    opacity: 1;
}

.timed-entry .delete-button {
    position: absolute;
    top: 1px;
    right: 2px;
}

/* Sits opposite the delete affordance so the two never overlap. */
.lane-handle {
    -webkit-user-select: none;
    user-select: none;
    position: absolute;
    top: 1px;
    left: 2px;
    font-size: 0.7rem;
    line-height: 1;
    cursor: grab;
    opacity: 0.85;
}
</style>
