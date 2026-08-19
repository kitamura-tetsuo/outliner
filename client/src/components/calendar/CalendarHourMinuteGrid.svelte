<script lang="ts">
// Single-day Hour Map renderer (#4972): one row per wall-clock hour, and each
// row's own width is that hour's 00-60 minute axis. A timed entry appears as
// one ordinary DOM fragment per hour it touches — deliberately not a single
// SVG path — so focus, pointer targets, resize handles and testing all stay
// exactly as simple as they are in `CalendarTimeGrid.svelte`; adjacent
// fragments are stitched together visually (flattened inner corners plus a
// continuation arrow) rather than structurally.
//
// All geometry — rows, fragments, lanes, which fragment carries the title —
// comes pre-computed from `calendarHourMinuteLayout.ts`; this component only
// turns minutes into percentages and lanes into pixels. Likewise it never
// writes Yjs: a move or resize reports the proposed start/duration to the
// parent `CalendarView`, which owns writability, optimistic placement and the
// actual write, exactly as the time grid does.

import type { DayHeader } from "../../services/calendar/calendarDayHeaders";
import { formatDragMoveLabel, formatDragResizeLabel, formatDuration } from "../../services/calendar/calendarDragLabel";
import type { CalendarEntry } from "../../services/calendar/calendarEntries";
import {
    DEFAULT_TIMED_DURATION_MS,
    type HourMinuteLayout,
    shiftInstant,
} from "../../services/calendar/calendarHourMinuteLayout";
import CalendarDragTooltip from "./CalendarDragTooltip.svelte";

const MIN_DURATION_MS = 5 * 60 * 1000;
const LANE_HEIGHT_PX = 22;
const KEYBOARD_STEP_MINUTES = 15;
/** Every row's minute track spans one whole hour, whatever slice of it the row itself covers. */
const MINUTES_PER_ROW = 60;
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MINUTE_TICKS = [0, 15, 30, 45];
/** Pointer travel below this is a click, not a drag (#4982). */
const CLICK_TOLERANCE_PX = 4;

interface Props {
    layout: HourMinuteLayout;
    /** The calendar's own timezone (§6.5) — every drag label formats in it, never viewer-local. */
    timeZone: string;
    dayHeader?: DayHeader;
    isStartWritable: (entry: CalendarEntry) => boolean;
    isDurationWritable: (entry: CalendarEntry) => boolean;
    onDragMove: (entry: CalendarEntry, newStartMs: number) => void;
    onDragEnd: (entry: CalendarEntry, newStartMs: number) => void;
    onDragCancel: (entry: CalendarEntry) => void;
    onResizeMove: (entry: CalendarEntry, newDurationMs: number) => void;
    onResizeEnd: (entry: CalendarEntry, newDurationMs: number) => void;
    onKeyboardMove: (entry: CalendarEntry, newStartMs: number) => void;
    onKeyboardResize: (entry: CalendarEntry, newDurationMs: number) => void;
    onDeleteRequest?: (entry: CalendarEntry) => void;
    isDeletable?: (entry: CalendarEntry) => boolean;
    /** True when double-clicking `entry` would reach an outline item (#4982). */
    isSourceNavigable?: (entry: CalendarEntry) => boolean;
    /** Open the outline item behind `entry`; the parent owns page resolution and routing. */
    onOpenSource?: (entry: CalendarEntry) => void;
    onEntryContextMenu?: (entry: CalendarEntry, event: MouseEvent | KeyboardEvent) => void;
}

let {
    layout,
    timeZone,
    dayHeader,
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
    isSourceNavigable = () => false,
    onOpenSource,
    onEntryContextMenu,
}: Props = $props();

let trackEls: (HTMLDivElement | undefined)[] = $state([]);
let rowEls: (HTMLDivElement | undefined)[] = $state([]);

let drag = $state<{
    kind: "move" | "resize"
    entry: CalendarEntry
    pointerId: number
    startClientX: number
    startRowIndex: number
    originStartMs: number
    originDurationMs: number
} | undefined>(undefined);

let dragLabel = $state<string | undefined>(undefined);
let pointerX = $state(0);
let pointerY = $state(0);

function trackWidthPx(): number {
    for (const el of trackEls) {
        if (!el) continue;
        const width = el.getBoundingClientRect().width;
        if (width > 0) return width;
    }
    return 0;
}

/** Which hour row the pointer is currently over; clamped to the first/last row. */
function rowIndexAtClientY(clientY: number): number {
    let index = 0;
    for (let i = 0; i < rowEls.length; i++) {
        const el = rowEls[i];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (clientY < rect.bottom) return i;
        index = i;
    }
    return index;
}

/** The duration `layoutHourMinuteGrid` drew this entry with. */
function renderedDurationMs(entry: CalendarEntry): number {
    return Math.max(MIN_DURATION_MS, entry.durationMs ?? DEFAULT_TIMED_DURATION_MS);
}

function beginDrag(kind: "move" | "resize", entry: CalendarEntry, rowIndex: number, e: PointerEvent) {
    if (e.button !== 0) return;
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
        startRowIndex: rowIndex,
        originStartMs: entry.startMs ?? layout.rows[0]?.startUtcMs ?? 0,
        // The length the entry is actually drawn with (the layout's own
        // default when the row carries none), so releasing a resize without
        // moving commits exactly what was already on screen.
        originDurationMs: renderedDurationMs(entry),
    };
}

/** Horizontal pointer travel as whole minutes — the same minute snapping the time grid applies. */
function dragDeltaMinutes(e: PointerEvent): number {
    if (!drag) return 0;
    const width = trackWidthPx();
    if (width <= 0) return 0;
    return Math.round(((e.clientX - drag.startClientX) / width) * MINUTES_PER_ROW);
}

function dragDeltaRows(e: PointerEvent): number {
    if (!drag) return 0;
    return rowIndexAtClientY(e.clientY) - drag.startRowIndex;
}

/** The snapped start a move at `e` would commit — vertical hours and horizontal minutes resolved together. */
function movedStartMs(e: PointerEvent): number {
    if (!drag) return 0;
    return shiftInstant(layout.rows, drag.originStartMs, dragDeltaRows(e), dragDeltaMinutes(e));
}

/** The snapped duration a resize at `e` would commit; the end instant moves, the start never does. */
function resizedDurationMs(e: PointerEvent): number {
    if (!drag) return MIN_DURATION_MS;
    const newEnd = shiftInstant(
        layout.rows,
        drag.originStartMs + drag.originDurationMs,
        dragDeltaRows(e),
        dragDeltaMinutes(e),
    );
    return Math.max(MIN_DURATION_MS, newEnd - drag.originStartMs);
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
    // A move that never travelled is a click, not a drag — see the same guard
    // (and the resize carve-out) in CalendarTimeGrid.svelte (#4982).
    if (
        drag.kind === "move"
        && Math.abs(e.clientX - drag.startClientX) <= CLICK_TOLERANCE_PX
        && dragDeltaRows(e) === 0
    ) {
        onDragCancel(drag.entry);
        drag = undefined;
        dragLabel = undefined;
        return;
    }
    if (drag.kind === "resize") onResizeEnd(drag.entry, resizedDurationMs(e));
    else onDragEnd(drag.entry, movedStartMs(e));
    drag = undefined;
    dragLabel = undefined;
}

/**
 * Double-click opens the entry's source item. Stopped here so it never
 * reaches the outliner item hosting this calendar block.
 */
function onEntryDoubleClick(entry: CalendarEntry, e: MouseEvent) {
    if (!isSourceNavigable(entry)) return;
    e.preventDefault();
    e.stopPropagation();
    onOpenSource?.(entry);
}

function onPointerCancel(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    onDragCancel(drag.entry);
    drag = undefined;
    dragLabel = undefined;
}

/**
 * Arrow-key moves, matching the existing grid's 15-minute step but along this
 * view's own axes: Left/Right steps minutes, Up/Down steps a whole hour row.
 */
function onEntryKeydown(entry: CalendarEntry, e: KeyboardEvent) {
    if ((e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) && isDeletable(entry)) {
        onEntryContextMenu?.(entry, e);
        return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && isDeletable(entry)) {
        e.preventDefault();
        onDeleteRequest?.(entry);
        return;
    }
    if (!isStartWritable(entry) || entry.startMs === undefined) return;
    const step = keyToStep(e.key);
    if (!step) return;
    e.preventDefault();
    onKeyboardMove(entry, shiftInstant(layout.rows, entry.startMs, step.rows, step.minutes));
}

function keyToStep(key: string): { rows: number; minutes: number; } | undefined {
    if (key === "ArrowLeft") return { rows: 0, minutes: -KEYBOARD_STEP_MINUTES };
    if (key === "ArrowRight") return { rows: 0, minutes: KEYBOARD_STEP_MINUTES };
    if (key === "ArrowUp") return { rows: -1, minutes: 0 };
    if (key === "ArrowDown") return { rows: 1, minutes: 0 };
    return undefined;
}

function onResizeKeydown(entry: CalendarEntry, e: KeyboardEvent) {
    if (!isDurationWritable(entry) || entry.startMs === undefined) return;
    const step = keyToStep(e.key);
    if (!step) return;
    e.preventDefault();
    e.stopPropagation(); // prevent bubbling to onEntryKeydown
    const currentDurationMs = renderedDurationMs(entry);
    const newEnd = shiftInstant(layout.rows, entry.startMs + currentDurationMs, step.rows, step.minutes);
    onKeyboardResize(entry, Math.max(MIN_DURATION_MS, newEnd - entry.startMs));
}

const hasBand = $derived(layout.allDay.length > 0 || layout.milestones.length > 0);
</script>

<svelte:window onpointermove={onPointerMove} onpointerup={onPointerUp} onpointercancel={onPointerCancel} />

<div class="hour-map" class:dragging={drag !== undefined} data-testid="calendar-hour-minute-grid">
    <div class="axis-header">
        <div class="hour-gutter" data-testid="calendar-hour-map-day-label">
            {#if dayHeader}{WEEKDAY_LABELS[dayHeader.weekday]} {dayHeader.dayOfMonth}{/if}
        </div>
        <div class="minute-axis">
            {#each MINUTE_TICKS as tick (tick)}
                <span class="minute-tick" style={`left: ${(tick / 60) * 100}%`}>:{String(tick).padStart(2, "0")}</span>
            {/each}
        </div>
    </div>

    {#if hasBand}
        <div class="band-row" data-testid="calendar-all-day-band">
            {#each layout.allDay as entry (entry.key)}
                <div
                    role="group"
                    aria-label={entry.title}
                    class="all-day-entry"
                    class:not-writable={!isStartWritable(entry)}
                    data-testid={`calendar-entry-allday-${entry.key}`}
                    data-navigable={isSourceNavigable(entry) ? "true" : undefined}
                    ondblclick={(e) => onEntryDoubleClick(entry, e)}
                    oncontextmenu={(e) => onEntryContextMenu?.(entry, e)}
                >
                    <div
                        role="button"
                        tabindex="0"
                        class="entry-title"
                        data-testid="calendar-entry-title"
                        onkeydown={(e) => onEntryKeydown(entry, e)}
                    >{entry.title}</div>
                    {#if isDeletable(entry)}
                        <button
                            type="button"
                            class="delete-button"
                            aria-label={`Delete ${entry.title}`}
                            data-testid={`calendar-entry-delete-${entry.key}`}
                            onclick={() => onDeleteRequest?.(entry)}
                        >×</button>
                    {/if}
                </div>
            {/each}
            {#each layout.milestones as entry (entry.key)}
                <div
                    role="group"
                    aria-label={entry.title}
                    class="milestone-entry"
                    data-testid={`calendar-entry-milestone-${entry.key}`}
                    data-navigable={isSourceNavigable(entry) ? "true" : undefined}
                    ondblclick={(e) => onEntryDoubleClick(entry, e)}
                    oncontextmenu={(e) => onEntryContextMenu?.(entry, e)}
                >
                    <div
                        role="button"
                        tabindex="0"
                        class="entry-title"
                        data-testid="calendar-entry-title"
                        onkeydown={(e) => onEntryKeydown(entry, e)}
                    >◆ {entry.title}</div>
                    {#if isDeletable(entry)}
                        <button
                            type="button"
                            class="delete-button"
                            aria-label={`Delete ${entry.title}`}
                            data-testid={`calendar-entry-delete-${entry.key}`}
                            onclick={() => onDeleteRequest?.(entry)}
                        >×</button>
                    {/if}
                </div>
            {/each}
        </div>
    {/if}

    <div class="rows-scroll" data-testid="calendar-hour-map-scroll">
        {#each layout.rows as row (row.rowIndex)}
            <div
                class="hour-row"
                class:repeated-hour={row.isRepeatedHour}
                data-testid={row.isRepeatedHour ? `calendar-hour-row-${row.hour}-repeated` : `calendar-hour-row-${row.hour}`}
                data-lane-count={row.laneCount}
                style={`height: ${row.laneCount * LANE_HEIGHT_PX}px`}
                bind:this={rowEls[row.rowIndex]}
            >
                <div class="hour-gutter" title={row.isRepeatedHour ? "Repeated hour (DST)" : undefined}>
                    {String(row.hour).padStart(2, "0")}{row.isRepeatedHour ? "*" : ""}
                </div>
                <div class="minute-track" bind:this={trackEls[row.rowIndex]}>
                    {#if row.workingStartMinute !== undefined && row.workingEndMinute !== undefined}
                        <div
                            class="working-hours-band"
                            data-testid={`calendar-hour-working-band-${row.hour}`}
                            style={`left: ${(row.workingStartMinute / MINUTES_PER_ROW) * 100}%; width: ${
                                ((row.workingEndMinute - row.workingStartMinute) / MINUTES_PER_ROW) * 100
                            }%`}
                        ></div>
                    {/if}
                    {#each row.fragments as f (`${f.entry.key}:${f.hour}`)}
                        <div
                            role="group"
                            aria-label={f.isTitleAnchor ? f.entry.title : `${f.entry.title} (continued)`}
                            class="fragment"
                            class:not-writable={!isStartWritable(f.entry)}
                            class:continues-left={!f.isFirst}
                            class:continues-right={!f.isLast}
                            data-testid={f.isTitleAnchor
                            ? `calendar-entry-${f.entry.key}`
                            : `calendar-entry-fragment-${f.entry.key}-${f.hour}`}
                            data-entry-key={f.entry.key}
                            data-hour={f.hour}
                            style={`left: ${(f.startMinute / MINUTES_PER_ROW) * 100}%; width: ${
                                ((f.endMinute - f.startMinute) / MINUTES_PER_ROW) * 100
                            }%; top: ${f.laneIndex * LANE_HEIGHT_PX}px; height: ${LANE_HEIGHT_PX - 2}px`}
                            data-navigable={isSourceNavigable(f.entry) ? "true" : undefined}
                            onpointerdown={(e) => {
                                beginDrag("move", f.entry, row.rowIndex, e);
                                (e.currentTarget.querySelector('.entry-title') as HTMLElement | null)?.focus();
                            }}
                            ondblclick={(e) => onEntryDoubleClick(f.entry, e)}
                            oncontextmenu={(e) => onEntryContextMenu?.(f.entry, e)}
                        >
                            {#if f.isTitleAnchor}
                                <div
                                    role="button"
                                    tabindex="0"
                                    class="entry-title"
                                    class:visually-hidden={!f.showTitle}
                                    data-testid="calendar-entry-title"
                                    title={f.entry.title}
                                    onkeydown={(e) => onEntryKeydown(f.entry, e)}
                                >{f.entry.title}</div>
                            {/if}
                            {#if f.isTitleAnchor && isDeletable(f.entry)}
                                <button
                                    type="button"
                                    class="delete-button"
                                    aria-label={`Delete ${f.entry.title}`}
                                    data-testid={`calendar-entry-delete-${f.entry.key}`}
                                    onpointerdown={(e) => e.stopPropagation()}
                                    onclick={(e) => {
                                        e.stopPropagation();
                                        onDeleteRequest?.(f.entry);
                                    }}
                                >×</button>
                            {/if}
                            {#if f.isLast && isDurationWritable(f.entry)}
                                <div
                                    role="slider"
                                    tabindex="0"
                                    aria-orientation="horizontal"
                                    aria-valuemin={MIN_DURATION_MS / 60000}
                                    aria-valuenow={renderedDurationMs(f.entry) / 60000}
                                    aria-valuetext={formatDuration(renderedDurationMs(f.entry))}
                                    aria-label={`Resize ${f.entry.title}`}
                                    class="resize-handle"
                                    data-testid={`calendar-entry-resize-${f.entry.key}`}
                                    onpointerdown={(e) => beginDrag("resize", f.entry, row.rowIndex, e)}
                                    onkeydown={(e) => onResizeKeydown(f.entry, e)}
                                ></div>
                            {/if}
                        </div>
                    {/each}
                </div>
            </div>
        {/each}
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

.hour-map {
    display: flex;
    flex-direction: column;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    overflow: clip;
}

.axis-header {
    display: flex;
    align-items: center;
    border-bottom: 1px solid #e5e7eb;
    background: #fff;
    font-size: 0.7rem;
    color: #6b7280;
    height: 20px;
}

.minute-axis {
    position: relative;
    flex: 1;
    height: 100%;
}

.minute-tick {
    position: absolute;
    top: 3px;
    transform: translateX(2px);
}

.band-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
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
    gap: 4px;
    background: #dbeafe;
    color: #1e3a8a;
    border-radius: 3px;
    padding: 2px 6px;
    font-size: 0.75rem;
}

.milestone-entry {
    background: transparent;
    color: #b45309;
}

.rows-scroll {
    display: flex;
    flex-direction: column;
    max-height: 480px;
    overflow-y: auto;
}

.hour-row {
    display: flex;
    align-items: stretch;
    border-top: 1px solid #f3f4f6;
    box-sizing: border-box;
}

.hour-row.repeated-hour .hour-gutter {
    color: #b45309;
}

.hour-gutter {
    flex: none;
    width: 3rem;
    text-align: right;
    padding-right: 6px;
    color: #9ca3af;
    font-size: 0.7rem;
    box-sizing: border-box;
}

.minute-track {
    position: relative;
    flex: 1;
}

.working-hours-band {
    position: absolute;
    top: 0;
    bottom: 0;
    background: #f9fafb;
}

.fragment {
    -webkit-user-select: none;
    user-select: none;
    position: absolute;
    display: flex;
    align-items: center;
    background: #2563eb;
    color: white;
    border-radius: 3px;
    font-size: 0.7rem;
    padding: 0 3px;
    overflow: hidden;
    box-sizing: border-box;
    cursor: grab;
    touch-action: none;
    min-width: 2px;
}

/* Fragments of one wrapped event read as a single object: the edge that
   continues into the next/previous hour row loses its rounding and gains a
   continuation arrow. */
.fragment.continues-right {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
    border-right: 2px solid #1d4ed8;
}

.fragment.continues-left {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    border-left: 2px solid #1d4ed8;
}

.fragment.continues-left::before {
    content: "›";
    opacity: 0.8;
    margin-right: 2px;
}

.fragment.not-writable {
    background: #9ca3af;
    cursor: default;
}

.entry-title {
    pointer-events: none;
    outline: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.entry-title:focus-visible {
    outline: 2px solid #fff;
    outline-offset: -2px;
    border-radius: 2px;
}

.all-day-entry .entry-title:focus-visible,
.milestone-entry .entry-title:focus-visible {
    outline-color: #2563eb;
}

/* An entry whose every fragment is too narrow for a title still needs one
   focusable, screen-reader-visible node — it just isn't drawn inline. */
.visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
}

.resize-handle {
    -webkit-user-select: none;
    user-select: none;
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    width: 6px;
    cursor: ew-resize;
    touch-action: none;
}

.delete-button {
    flex: none;
    border: none;
    background: transparent;
    color: inherit;
    opacity: 0.75;
    cursor: pointer;
    font-size: 0.8rem;
    line-height: 1;
    padding: 0 2px;
    margin-left: auto;
}

.delete-button:hover {
    opacity: 1;
}

.not-writable {
    opacity: 0.7;
    cursor: default;
}
</style>
