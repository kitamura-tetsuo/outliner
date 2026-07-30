<script lang="ts">
// Grouping lanes for the day/multi-day/week time-grid views (#4348):
// horizontal swimlanes, one `CalendarTimeGrid` band per lane, stacked
// vertically — the arrangement docs/crdt-sql-architecture.md §6.3 calls for
// outside the day view's sub-column layout (deferred; see the component's
// own scope note in the PR).
//
// Rescheduling (time/day) is untouched: each band is a full `CalendarTimeGrid`
// instance, so its existing pointer-based drag/resize keeps working exactly
// as it does when ungrouped. Moving a card *between* lanes is a distinct
// gesture — a small drag handle native-HTML5-drags onto another band, which
// is what makes the "add vs replace" `Ctrl`/`Cmd` legibility work (dragover's
// own `ctrlKey`/`metaKey`), and what keeps this from fighting the reschedule
// drag's `setPointerCapture` for the same pointer gesture.

import type { DayHeader } from "../../services/calendar/calendarDayHeaders";
import type { CalendarEntry } from "../../services/calendar/calendarEntries";
import type { CalendarLane } from "../../services/calendar/calendarGrouping";
import { collapseLanePath } from "../../services/calendar/calendarGrouping";
import { layoutTimeGrid } from "../../services/calendar/calendarTimeGridLayout";
import CalendarTimeGrid from "./CalendarTimeGrid.svelte";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Props {
    lanes: CalendarLane[];
    dayHeaders?: DayHeader[];
    todayUtcMs?: number;
    rangeStart: number;
    rangeEnd: number;
    workingHoursStartMinutes: number;
    workingHoursEndMinutes: number;
    isStartWritable: (entry: CalendarEntry) => boolean;
    isDurationWritable: (entry: CalendarEntry) => boolean;
    isLaneWritable: (entry: CalendarEntry) => boolean;
    onDragMove: (entry: CalendarEntry, newStartMs: number) => void;
    onDragEnd: (entry: CalendarEntry, newStartMs: number) => void;
    onDragCancel: (entry: CalendarEntry) => void;
    onResizeMove: (entry: CalendarEntry, newDurationMs: number) => void;
    onResizeEnd: (entry: CalendarEntry, newDurationMs: number) => void;
    onKeyboardMove: (entry: CalendarEntry, newStartMs: number) => void;
    onLaneDrop: (entry: CalendarEntry, laneValue: string | undefined, mode: "replace" | "add") => void;
    /** Delete affordance, passed straight through to each lane's grid (#4349). */
    onDeleteRequest?: (entry: CalendarEntry) => void;
    isDeletable?: (entry: CalendarEntry) => boolean;
}

let {
    lanes,
    dayHeaders,
    todayUtcMs,
    rangeStart,
    rangeEnd,
    workingHoursStartMinutes,
    workingHoursEndMinutes,
    isStartWritable,
    isDurationWritable,
    isLaneWritable,
    onDragMove,
    onDragEnd,
    onDragCancel,
    onResizeMove,
    onResizeEnd,
    onKeyboardMove,
    onLaneDrop,
    onDeleteRequest,
    isDeletable = () => false,
}: Props = $props();

const bands = $derived(lanes.map((lane) => ({ lane, layout: layoutTimeGrid(lane.entries, rangeStart, rangeEnd) })));

function laneTestId(value: string | undefined): string {
    return value ?? "none";
}

let draggingEntry: CalendarEntry | undefined;
let hoveredLane = $state<string | undefined>(undefined);
let hoveredMode = $state<"replace" | "add">("replace");

function onHandleDragStart(entry: CalendarEntry, e: DragEvent) {
    draggingEntry = entry;
    e.dataTransfer?.setData("text/plain", entry.key);
}

function onBandDragOver(lane: CalendarLane, e: DragEvent) {
    if (!draggingEntry) return;
    e.preventDefault();
    hoveredLane = laneTestId(lane.value);
    hoveredMode = e.ctrlKey || e.metaKey ? "add" : "replace";
}

function onBandDragLeave(lane: CalendarLane) {
    if (hoveredLane === laneTestId(lane.value)) hoveredLane = undefined;
}

function onBandDrop(lane: CalendarLane, e: DragEvent) {
    e.preventDefault();
    hoveredLane = undefined;
    // `draggingEntry` is the fast path. Recover from the standard
    // DataTransfer payload as well: a reactive redraw between dragover and
    // drop must not turn a valid browser drag into a no-op.
    const draggedKey = e.dataTransfer?.getData("text/plain");
    const entry = draggingEntry
        ?? (draggedKey ? lanes.flatMap((candidate) => candidate.entries).find(({ key }) => key === draggedKey) : undefined);
    if (!entry) return;
    const mode = e.ctrlKey || e.metaKey ? "add" : "replace";
    onLaneDrop(entry, lane.value, mode);
    draggingEntry = undefined;
}
</script>

<div class="lane-time-grid" data-testid="calendar-lane-time-grid">
    {#if dayHeaders && bands.length > 0}
        <div class="day-header-row" style={`grid-template-columns: 3.5rem repeat(${bands[0].layout.dayCount}, 1fr)`}>
            <div class="header-spacer"></div>
            {#each dayHeaders as header (header.dayIndex)}
                <div
                    class="day-header-cell"
                    class:is-today={header.dateUtcMs === todayUtcMs}
                    class:is-weekend={header.weekday === 0 || header.weekday === 6}
                    data-testid={`calendar-day-header-${header.dayIndex}`}
                    data-date={header.isoDate}
                >
                    {WEEKDAY_LABELS[header.weekday]} {header.month}/{header.dayOfMonth}
                </div>
            {/each}
        </div>
    {/if}

    {#each bands as { lane, layout } (laneTestId(lane.value))}
        <div
            role="group"
            class="lane-band"
            class:lane-drop-target={hoveredLane === laneTestId(lane.value)}
            class:lane-drop-add={hoveredLane === laneTestId(lane.value) && hoveredMode === "add"}
            data-testid={`calendar-lane-${laneTestId(lane.value)}`}
            ondragover={(e) => onBandDragOver(lane, e)}
            ondragleave={() => onBandDragLeave(lane)}
            ondrop={(e) => onBandDrop(lane, e)}
        >
            <div
                role="group"
                class="lane-header"
                data-testid={`calendar-lane-header-${laneTestId(lane.value)}`}
                ondragover={(e) => {
                    e.stopPropagation();
                    onBandDragOver(lane, e);
                }}
                ondrop={(e) => {
                    e.stopPropagation();
                    onBandDrop(lane, e);
                }}
            >
                {collapseLanePath(lane.path)}
                {#if hoveredLane === laneTestId(lane.value)}
                    <span class="lane-drop-hint">{hoveredMode === "add" ? "add" : "move here"}</span>
                {/if}
            </div>
            <CalendarTimeGrid
                {layout}
                {rangeStart}
                {workingHoursStartMinutes}
                {workingHoursEndMinutes}
                {isStartWritable}
                {isDurationWritable}
                {onDragMove}
                {onDragEnd}
                {onDragCancel}
                {onResizeMove}
                {onResizeEnd}
                {onKeyboardMove}
                {isDeletable}
                {onDeleteRequest}
                isLaneWritable={(entry) => isLaneWritable(entry)}
                onLaneDragStart={onHandleDragStart}
            />
        </div>
    {/each}
</div>

<style>
.lane-time-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.day-header-row {
    display: grid;
    position: sticky;
    top: 0;
    z-index: 2;
    background: #fff;
    border-bottom: 1px solid #e5e7eb;
}

.day-header-cell {
    padding: 4px;
    text-align: center;
    font-size: 0.75rem;
    font-weight: 600;
    color: #374151;
    border-left: 1px solid #f3f4f6;
}

.day-header-cell.is-today {
    color: #2563eb;
}

.day-header-cell.is-weekend {
    color: #6b7280;
    background: #f9fafb;
}

.lane-band {
    border: 1px solid transparent;
    border-radius: 4px;
}

.lane-band.lane-drop-target {
    border-color: #2563eb;
    background: #eff6ff;
}

.lane-band.lane-drop-target.lane-drop-add {
    border-color: #16a34a;
    background: #f0fdf4;
}

.lane-header {
    font-size: 0.75rem;
    font-weight: 600;
    color: #374151;
    padding: 2px 4px;
}

.lane-drop-hint {
    font-weight: 400;
    color: #6b7280;
    margin-left: 6px;
}
</style>
