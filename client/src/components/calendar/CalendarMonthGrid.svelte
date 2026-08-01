<script lang="ts">
// Month view (#4347): a 7-column grid of day cells (already padded to whole
// weeks by calendarGridRange.ts's "month" range). Entries render inline per
// cell (calendarMonthGridLayout.ts already placed an all-day entry in every
// cell it covers); dragging a card between cells writes its start *date*
// only — a month cell has no time-of-day axis, so a timed entry keeps its
// original wall-clock time-of-day and only its calendar date moves.

import type { CalendarEntry } from "../../services/calendar/calendarEntries";
import { laneColor } from "../../services/calendar/calendarLaneColor";
import type { MonthCell } from "../../services/calendar/calendarMonthGridLayout";

const DAY_MS = 86_400_000;
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Props {
    cells: MonthCell[];
    weekStart: number;
    todayUtcMs?: number;
    isStartWritable: (entry: CalendarEntry) => boolean;
    onDragEnd: (entry: CalendarEntry, newStartMs: number) => void;
    onKeyboardMove: (entry: CalendarEntry, newStartMs: number) => void;
    onDeleteRequest?: (entry: CalendarEntry) => void;
    isDeletable?: (entry: CalendarEntry) => boolean;
    /**
     * A lane is "not a layout" in month view (docs/crdt-sql-architecture.md
     * §6.3) — grouping shows up as a colour per entry instead. Absent when no
     * grouping axis is assigned.
     */
    laneLabel?: (entry: CalendarEntry) => string;
}

let {
    cells,
    weekStart,
    todayUtcMs,
    isStartWritable,
    onDragEnd,
    onKeyboardMove,
    onDeleteRequest,
    isDeletable = () => false,
    laneLabel,
}: Props = $props();

const weekdayHeaders = $derived(
    Array.from({ length: 7 }, (_, i) => WEEKDAY_LABELS[(weekStart + i) % 7]),
);

function timeOfDayMs(startMs: number): number {
    return ((startMs % DAY_MS) + DAY_MS) % DAY_MS;
}

function onDropOnCell(entry: CalendarEntry, cell: MonthCell) {
    if (!isStartWritable(entry) || entry.startMs === undefined) return;
    const newStart = entry.allDay ? cell.dateUtcMs : cell.dateUtcMs + timeOfDayMs(entry.startMs);
    onDragEnd(entry, newStart);
}

function keyToDeltaDays(key: string): number | undefined {
    if (key === "ArrowLeft") return -1;
    if (key === "ArrowRight") return 1;
    if (key === "ArrowUp") return -7;
    if (key === "ArrowDown") return 7;
    return undefined;
}

function onCellKeydown(entry: CalendarEntry, e: KeyboardEvent) {
    if ((e.key === "Delete" || e.key === "Backspace") && isDeletable(entry)) {
        e.preventDefault();
        onDeleteRequest?.(entry);
        return;
    }
    if (!isStartWritable(entry) || entry.startMs === undefined) return;
    const deltaDays = keyToDeltaDays(e.key);
    if (deltaDays === undefined) return;
    e.preventDefault();
    onKeyboardMove(entry, entry.startMs + deltaDays * DAY_MS);
}

let draggingKey: string | undefined = $state();

function onDragStart(entry: CalendarEntry, e: DragEvent) {
    if (!isStartWritable(entry)) {
        e.preventDefault();
        return;
    }
    draggingKey = entry.key;
    e.dataTransfer?.setData("text/plain", entry.key);
}

function findEntry(key: string | undefined): CalendarEntry | undefined {
    if (!key) return undefined;
    for (const cell of cells) {
        const hit = cell.entries.find((c) => c.entry.key === key);
        if (hit) return hit.entry;
    }
    return undefined;
}

function onDrop(cell: MonthCell, e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const key = e.dataTransfer?.getData("text/plain") ?? draggingKey;
    const entry = findEntry(key);
    draggingKey = undefined;
    if (entry) onDropOnCell(entry, cell);
}
</script>

<div class="month-grid" data-block-dnd-owner="calendar" class:dragging={draggingKey !== undefined} data-testid="calendar-month-grid">
    <div class="weekday-header">
        {#each weekdayHeaders as label (label)}
            <div class="weekday-label">{label}</div>
        {/each}
    </div>
    <div class="cells">
        {#each cells as cell (cell.dayIndex)}
            <div
                role="gridcell"
                tabindex="-1"
                class="month-cell"
                class:is-today={todayUtcMs !== undefined && cell.dateUtcMs === todayUtcMs}
                data-testid={`calendar-month-cell-${cell.dayIndex}`}
                ondragover={(e) => e.preventDefault()}
                ondrop={(e) => onDrop(cell, e)}
            >
                <div class="cell-date">{new Date(cell.dateUtcMs).getUTCDate()}</div>
                {#each cell.milestones as m (m.key)}
                    <div
                        role="button"
                        tabindex="0"
                        class="milestone-chip"
                        data-testid={`calendar-entry-milestone-${m.key}`}
                        onkeydown={(e) => onCellKeydown(m, e)}
                    >
                        <span class="chip-title" data-testid="calendar-entry-title">◆ {m.title}</span>
                        {#if isDeletable(m)}
                            <button
                                type="button"
                                class="delete-button"
                                aria-label={`Delete ${m.title}`}
                                data-testid={`calendar-entry-delete-${m.key}`}
                                onclick={(e) => {
                                    e.stopPropagation();
                                    onDeleteRequest?.(m);
                                }}
                            >×</button>
                        {/if}
                    </div>
                {/each}
                {#each cell.entries as { entry } (entry.key)}
                    <div
                        role="button"
                        tabindex="0"
                        class="entry-chip"
                        class:not-writable={!isStartWritable(entry)}
                        draggable={isStartWritable(entry)}
                        data-testid={`calendar-entry-${entry.key}`}
                        data-lane={laneLabel?.(entry)}
                        style={laneLabel && isStartWritable(entry) ? `background: ${laneColor(laneLabel(entry))}` : undefined}
                        ondragstart={(e) => onDragStart(entry, e)}
                        onkeydown={(e) => onCellKeydown(entry, e)}
                    >
                        <span class="chip-title" data-testid="calendar-entry-title">{entry.title}</span>
                        {#if isDeletable(entry)}
                            <button
                                type="button"
                                class="delete-button"
                                aria-label={`Delete ${entry.title}`}
                                data-testid={`calendar-entry-delete-${entry.key}`}
                                onclick={(e) => {
                                    e.stopPropagation();
                                    onDeleteRequest?.(entry);
                                }}
                            >×</button>
                        {/if}
                    </div>
                {/each}
            </div>
        {/each}
    </div>
</div>

<style>
:global(.dragging), :global(.dragging *) {
    -webkit-user-select: none !important;
    user-select: none !important;
}

.month-grid {
    display: flex;
    flex-direction: column;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    overflow: clip;
}

.weekday-header {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    position: sticky;
    top: 0;
    z-index: 1;
    background: #fff;
}

.cells {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
}

.weekday-label {
    padding: 4px 6px;
    font-size: 0.7rem;
    font-weight: 600;
    color: #6b7280;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
}

.month-cell {
    min-height: 88px;
    border-right: 1px solid #f3f4f6;
    border-bottom: 1px solid #f3f4f6;
    padding: 2px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    box-sizing: border-box;
}

.month-cell.is-today {
    background: #eff6ff;
}

.cell-date {
    font-size: 0.7rem;
    color: #6b7280;
}

.entry-chip,
.milestone-chip {
    -webkit-user-select: none;
    user-select: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    background: #2563eb;
    color: white;
    border-radius: 3px;
    padding: 1px 4px;
    font-size: 0.7rem;
    overflow: hidden;
    cursor: grab;
}

.chip-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.entry-chip.not-writable {
    background: #9ca3af;
    cursor: default;
}

.milestone-chip {
    background: transparent;
    color: #b45309;
    cursor: default;
}

.delete-button {
    flex: none;
    border: none;
    background: transparent;
    color: inherit;
    opacity: 0.8;
    cursor: pointer;
    font-size: 0.8rem;
    line-height: 1;
    padding: 0 2px;
}

.delete-button:hover {
    opacity: 1;
}
</style>
