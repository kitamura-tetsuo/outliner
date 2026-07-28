<script lang="ts">
// Month view (#4347): a 7-column grid of day cells (already padded to whole
// weeks by calendarGridRange.ts's "month" range). Entries render inline per
// cell (calendarMonthGridLayout.ts already placed an all-day entry in every
// cell it covers); dragging a card between cells writes its start *date*
// only — a month cell has no time-of-day axis, so a timed entry keeps its
// original wall-clock time-of-day and only its calendar date moves.

import type { CalendarEntry } from "../../services/calendar/calendarEntries";
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
}

let { cells, weekStart, todayUtcMs, isStartWritable, onDragEnd, onKeyboardMove }: Props = $props();

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

function onCellKeydown(entry: CalendarEntry, e: KeyboardEvent) {
    if (!isStartWritable(entry) || entry.startMs === undefined) return;
    let deltaDays;
    if (e.key === "ArrowLeft") deltaDays = -1;
    else if (e.key === "ArrowRight") deltaDays = 1;
    else if (e.key === "ArrowUp") deltaDays = -7;
    else if (e.key === "ArrowDown") deltaDays = 7;
    else return;
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
    const key = e.dataTransfer?.getData("text/plain") ?? draggingKey;
    const entry = findEntry(key);
    draggingKey = undefined;
    if (entry) onDropOnCell(entry, cell);
}
</script>

<div class="month-grid" data-testid="calendar-month-grid">
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
                    <div class="milestone-chip" data-testid={`calendar-entry-milestone-${m.key}`}>◆ {m.title}</div>
                {/each}
                {#each cell.entries as { entry } (entry.key)}
                    <div
                        role="button"
                        tabindex="0"
                        class="entry-chip"
                        class:not-writable={!isStartWritable(entry)}
                        draggable={isStartWritable(entry)}
                        data-testid={`calendar-entry-${entry.key}`}
                        ondragstart={(e) => onDragStart(entry, e)}
                        onkeydown={(e) => onCellKeydown(entry, e)}
                    >
                        {entry.title}
                    </div>
                {/each}
            </div>
        {/each}
    </div>
</div>

<style>
.month-grid {
    display: flex;
    flex-direction: column;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
}

.weekday-header,
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
    background: #2563eb;
    color: white;
    border-radius: 3px;
    padding: 1px 4px;
    font-size: 0.7rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: grab;
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
</style>
