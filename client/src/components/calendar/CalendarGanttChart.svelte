<script lang="ts">
// Gantt view (#4350): one row per entry, a bar spanning start to derived
// end, nested by the outline hierarchy, across a horizontal axis whose
// granularity is a view setting (day/week/month/quarter). Shares the parent
// CalendarView's write dispatch, writability rule and optimistic-placement
// model with the time-grid views (#4347) for a leaf bar; the one write this
// view adds is the parent roll-up's subtree shift (calendarGanttWrite.ts),
// gated by `analyzeSubtreeShift` and batched as a single undo entry.
//
// Collapse/expand state is per-viewer, local `$state` — never written to the
// project doc (§6.7): folding a subtree here must not fold it for anyone
// else, and it is not worth an undo entry.

import type { CalendarEntry } from "../../services/calendar/calendarEntries";
import { ganttInstantFraction, type GanttRow, layoutGantt, placeGanttBar } from "../../services/calendar/calendarGanttLayout";
import type { GanttSubtreeShiftAnalysis } from "../../services/calendar/calendarGanttWrite";
import type { GanttScale, GanttTick } from "../../services/calendar/calendarGridRange";

const ROW_HEIGHT_PX = 28;
const LABEL_COLUMN_PX = 220;
const DAY_MS = 86_400_000;

const GANTT_SCALE_OPTIONS: { value: GanttScale; label: string; }[] = [
    { value: "day", label: "Day" },
    { value: "week", label: "Week" },
    { value: "month", label: "Month" },
    { value: "quarter", label: "Quarter" },
];

interface Props {
    entries: CalendarEntry[];
    groupAxes: string[];
    rangeStart: number;
    rangeEnd: number;
    ticks: GanttTick[];
    scale: GanttScale;
    onScaleChange: (scale: GanttScale) => void;
    isLeafStartWritable: (entry: CalendarEntry) => boolean;
    isLeafDurationWritable: (entry: CalendarEntry) => boolean;
    analyzeSubtreeShift: (row: GanttRow) => GanttSubtreeShiftAnalysis;
    onLeafDragMove: (entry: CalendarEntry, newStartMs: number) => void;
    onLeafDragEnd: (entry: CalendarEntry, newStartMs: number) => void;
    onLeafDragCancel: (entry: CalendarEntry) => void;
    onLeafResizeMove: (entry: CalendarEntry, newDurationMs: number) => void;
    onLeafResizeEnd: (entry: CalendarEntry, newDurationMs: number) => void;
    onLeafKeyboardMove: (entry: CalendarEntry, newStartMs: number) => void;
    onSubtreeDragEnd: (row: GanttRow, deltaMs: number, analysis: GanttSubtreeShiftAnalysis) => void;
}

let {
    entries,
    groupAxes,
    rangeStart,
    rangeEnd,
    ticks,
    scale,
    onScaleChange,
    isLeafStartWritable,
    isLeafDurationWritable,
    analyzeSubtreeShift,
    onLeafDragMove,
    onLeafDragEnd,
    onLeafDragCancel,
    onLeafResizeMove,
    onLeafResizeEnd,
    onLeafKeyboardMove,
    onSubtreeDragEnd,
}: Props = $props();

let collapsedKeys = $state<Set<string>>(new Set());

const layout = $derived(layoutGantt(entries, groupAxes, collapsedKeys));

function toggleCollapse(key: string) {
    const next = new Set(collapsedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    collapsedKeys = next;
}

function tickFraction(tick: GanttTick): number {
    return (tick.startUtcMs - rangeStart) / (rangeEnd - rangeStart);
}

type Drag =
    | { kind: "leaf-move"; row: GanttRow; pointerId: number; startClientX: number; originStartMs: number; }
    | { kind: "leaf-resize"; row: GanttRow; pointerId: number; startClientX: number; originDurationMs: number; }
    | {
        kind: "subtree-move";
        row: GanttRow;
        pointerId: number;
        startClientX: number;
        analysis: GanttSubtreeShiftAnalysis;
    };

let drag: Drag | undefined;
let previewDeltaMs = $state<number | undefined>(undefined);
let previewRowKey = $state<string | undefined>(undefined);

// Every row's `.timeline-cell` shares one horizontal layout (a single
// column to the right of the fixed-width label column), so any one of them
// has the same pixel width — binding the last-rendered row's element here is
// enough to measure it; there is no need to track the specific row being
// dragged.
let timelineEl: HTMLDivElement | undefined = $state();

function msPerPixel(): number {
    if (!timelineEl) return DAY_MS / 40;
    const width = timelineEl.getBoundingClientRect().width || 1;
    return (rangeEnd - rangeStart) / width;
}

function snapToDay(deltaMs: number): number {
    return Math.round(deltaMs / DAY_MS) * DAY_MS;
}

function beginLeafDrag(row: GanttRow, e: PointerEvent) {
    if (row.isRollup || row.barStartMs === undefined || !isLeafStartWritable(row.entry)) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = { kind: "leaf-move", row, pointerId: e.pointerId, startClientX: e.clientX, originStartMs: row.barStartMs };
}

function beginLeafResize(row: GanttRow, e: PointerEvent) {
    if (row.isRollup || row.barStartMs === undefined || row.barEndMs === undefined || !isLeafDurationWritable(row.entry)) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = {
        kind: "leaf-resize",
        row,
        pointerId: e.pointerId,
        startClientX: e.clientX,
        originDurationMs: row.barEndMs - row.barStartMs,
    };
}

function beginSubtreeDrag(row: GanttRow, e: PointerEvent) {
    if (!row.isRollup) return;
    const analysis = analyzeSubtreeShift(row);
    if (!analysis.shiftable || analysis.members.length === 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = { kind: "subtree-move", row, pointerId: e.pointerId, startClientX: e.clientX, analysis };
}

function onPointerMove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const rawDeltaMs = (e.clientX - drag.startClientX) * msPerPixel();

    if (drag.kind === "leaf-resize") {
        const newDuration = Math.max(DAY_MS, drag.originDurationMs + snapToDay(rawDeltaMs));
        onLeafResizeMove(drag.row.entry, newDuration);
        return;
    }

    const deltaMs = snapToDay(rawDeltaMs);
    previewRowKey = drag.row.key;
    previewDeltaMs = deltaMs;
    if (drag.kind === "leaf-move") {
        onLeafDragMove(drag.row.entry, drag.originStartMs + deltaMs);
    }
}

function endDrag(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const rawDeltaMs = (e.clientX - drag.startClientX) * msPerPixel();

    if (drag.kind === "leaf-resize") {
        const newDuration = Math.max(DAY_MS, drag.originDurationMs + snapToDay(rawDeltaMs));
        onLeafResizeEnd(drag.row.entry, newDuration);
    } else if (drag.kind === "leaf-move") {
        onLeafDragEnd(drag.row.entry, drag.originStartMs + snapToDay(rawDeltaMs));
    } else {
        const deltaMs = snapToDay(rawDeltaMs);
        if (deltaMs !== 0) onSubtreeDragEnd(drag.row, deltaMs, drag.analysis);
    }

    previewRowKey = undefined;
    previewDeltaMs = undefined;
    drag = undefined;
}

function onPointerCancel(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (drag.kind === "leaf-move") onLeafDragCancel(drag.row.entry);
    previewRowKey = undefined;
    previewDeltaMs = undefined;
    drag = undefined;
}

/** Keyboard: Left/Right shift a writable leaf bar or a shiftable subtree by one day. */
function onRowKeydown(row: GanttRow, e: KeyboardEvent) {
    let deltaMs = 0;
    if (e.key === "ArrowLeft") deltaMs = -DAY_MS;
    else if (e.key === "ArrowRight") deltaMs = DAY_MS;
    else return;

    if (row.isRollup) {
        const analysis = analyzeSubtreeShift(row);
        if (!analysis.shiftable || analysis.members.length === 0) return;
        e.preventDefault();
        onSubtreeDragEnd(row, deltaMs, analysis);
        return;
    }

    if (row.barStartMs === undefined || !isLeafStartWritable(row.entry)) return;
    e.preventDefault();
    onLeafKeyboardMove(row.entry, row.barStartMs + deltaMs);
}

function barLeftPct(row: GanttRow): number {
    const placement = placeGanttBar(row, rangeStart, rangeEnd);
    if (!placement) return 0;
    const shift = previewRowKey === row.key && previewDeltaMs !== undefined ? previewDeltaMs / (rangeEnd - rangeStart) : 0;
    return Math.max(0, (placement.startFraction + shift) * 100);
}

function barWidthPct(row: GanttRow): number {
    const placement = placeGanttBar(row, rangeStart, rangeEnd);
    if (!placement) return 0;
    return Math.max(0.5, (placement.endFraction - placement.startFraction) * 100);
}

function pointLeftPct(ms: number | undefined): number | undefined {
    if (ms === undefined) return undefined;
    const f = ganttInstantFraction(ms, rangeStart, rangeEnd);
    return f === undefined ? undefined : f * 100;
}
</script>

<svelte:window onpointermove={onPointerMove} onpointerup={endDrag} onpointercancel={onPointerCancel} />

<div class="gantt-chart" data-testid="calendar-gantt-chart">
    <div class="gantt-toolbar">
        <label class="scale-control">
            <span>Scale</span>
            <select
                data-testid="calendar-gantt-scale"
                value={scale}
                onchange={(e) => onScaleChange((e.target as HTMLSelectElement).value as GanttScale)}
            >
                {#each GANTT_SCALE_OPTIONS as opt (opt.value)}
                    <option value={opt.value}>{opt.label}</option>
                {/each}
            </select>
        </label>
        {#if layout.grouped}
            <span class="grouped-hint" data-testid="calendar-gantt-grouped-hint">
                Grouped by axis — hierarchy and roll-up are flattened while a group axis is active.
            </span>
        {/if}
    </div>

    <div class="gantt-header">
        <div class="label-column-header" style={`width: ${LABEL_COLUMN_PX}px`}></div>
        <div class="tick-header">
            {#each ticks as tick (tick.startUtcMs)}
                <div class="tick-label" style={`left: ${tickFraction(tick) * 100}%`}>{tick.label}</div>
            {/each}
        </div>
    </div>

    <div class="gantt-body">
        {#if layout.grouped}
            {#each layout.lanes ?? [] as lane (lane.key ?? "\0null")}
                <div class="lane-section">
                    <div class="lane-header" data-testid={`calendar-gantt-lane-${lane.key ?? "none"}`}>
                        {lane.key ?? "(none)"}
                    </div>
                    {#each lane.rows as row (row.key)}
                        {@render ganttRow(row)}
                    {/each}
                </div>
            {/each}
        {:else}
            {#each layout.rows ?? [] as row (row.key)}
                {@render ganttRow(row)}
            {/each}
        {/if}
    </div>
</div>

{#snippet ganttRow(row: GanttRow)}
    <div class="gantt-row" style={`height: ${ROW_HEIGHT_PX}px`} data-testid={`calendar-gantt-row-${row.key}`}>
        <div class="label-cell" style={`width: ${LABEL_COLUMN_PX}px; padding-left: ${8 + row.depth * 14}px`}>
            {#if row.hasChildren}
                <button
                    type="button"
                    class="collapse-toggle"
                    data-testid={`calendar-gantt-collapse-${row.key}`}
                    aria-label={row.collapsed ? `Expand ${row.entry.title}` : `Collapse ${row.entry.title}`}
                    onclick={() => toggleCollapse(row.key)}
                >{row.collapsed ? "▸" : "▾"}</button>
            {/if}
            <span class="label-text">{row.entry.title}</span>
        </div>
        <div class="timeline-cell" bind:this={timelineEl}>
            {#if row.barStartMs !== undefined}
                <div
                    role="button"
                    tabindex="0"
                    class="gantt-bar"
                    class:rollup={row.isRollup}
                    class:not-writable={!row.isRollup && !isLeafStartWritable(row.entry)}
                    data-testid={`calendar-gantt-bar-${row.key}`}
                    style={`left: ${barLeftPct(row)}%; width: ${barWidthPct(row)}%`}
                    onpointerdown={(e) => row.isRollup ? beginSubtreeDrag(row, e) : beginLeafDrag(row, e)}
                    onkeydown={(e) => onRowKeydown(row, e)}
                >
                    <span class="bar-title">{row.entry.title}</span>
                    {#if !row.isRollup && isLeafDurationWritable(row.entry)}
                        <div
                            role="separator"
                            aria-label={`Resize ${row.entry.title}`}
                            class="resize-handle"
                            data-testid={`calendar-gantt-resize-${row.key}`}
                            onpointerdown={(e) => beginLeafResize(row, e)}
                        ></div>
                    {/if}
                </div>
            {:else if row.startPointMs !== undefined && pointLeftPct(row.startPointMs) !== undefined}
                <div
                    class="start-point"
                    data-testid={`calendar-gantt-point-${row.key}`}
                    style={`left: ${pointLeftPct(row.startPointMs)}%`}
                >● {row.entry.title}</div>
            {/if}
            {#if row.dueMarkerMs !== undefined && pointLeftPct(row.dueMarkerMs) !== undefined}
                <div
                    class="due-marker"
                    data-testid={`calendar-gantt-milestone-${row.key}`}
                    style={`left: ${pointLeftPct(row.dueMarkerMs)}%`}
                >◆</div>
            {/if}
        </div>
    </div>
{/snippet}

<style>
.gantt-chart {
    display: flex;
    flex-direction: column;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
}

.gantt-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 4px 8px;
    border-bottom: 1px solid #e5e7eb;
    background: #f9fafb;
}

.scale-control {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    color: #374151;
}

.grouped-hint {
    font-size: 0.75rem;
    color: #92400e;
}

.gantt-header {
    display: flex;
    border-bottom: 1px solid #e5e7eb;
}

.label-column-header {
    flex: none;
    border-right: 1px solid #e5e7eb;
}

.tick-header {
    position: relative;
    flex: 1;
    height: 22px;
    overflow: hidden;
}

.tick-label {
    position: absolute;
    top: 0;
    font-size: 0.65rem;
    color: #6b7280;
    padding-left: 2px;
    border-left: 1px solid #f3f4f6;
    white-space: nowrap;
}

.gantt-body {
    max-height: 480px;
    overflow-y: auto;
    overflow-x: hidden;
}

.lane-header {
    padding: 3px 8px;
    font-size: 0.75rem;
    font-weight: 600;
    color: #374151;
    background: #f3f4f6;
}

.gantt-row {
    display: flex;
    border-bottom: 1px solid #f3f4f6;
    box-sizing: border-box;
}

.label-cell {
    flex: none;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.75rem;
    box-sizing: border-box;
    border-right: 1px solid #f3f4f6;
    overflow: hidden;
}

.collapse-toggle {
    border: none;
    background: none;
    cursor: pointer;
    font-size: 0.7rem;
    padding: 0;
    color: #6b7280;
}

.label-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.timeline-cell {
    position: relative;
    flex: 1;
}

.gantt-bar {
    position: absolute;
    top: 4px;
    height: calc(100% - 8px);
    background: #2563eb;
    color: white;
    border-radius: 3px;
    font-size: 0.7rem;
    padding: 2px 4px;
    box-sizing: border-box;
    overflow: hidden;
    white-space: nowrap;
    cursor: grab;
    touch-action: none;
}

.gantt-bar.rollup {
    background: #4b5563;
    cursor: grab;
}

.gantt-bar.not-writable {
    background: #9ca3af;
    cursor: default;
}

.bar-title {
    pointer-events: none;
}

.resize-handle {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 6px;
    cursor: ew-resize;
    touch-action: none;
}

.start-point,
.due-marker {
    position: absolute;
    top: 4px;
    font-size: 0.7rem;
    color: #b45309;
    white-space: nowrap;
}

.due-marker {
    color: #b91c1c;
}
</style>
