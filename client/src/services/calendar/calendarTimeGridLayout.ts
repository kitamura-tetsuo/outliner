// Pure geometry for the day/multi-day/week time-grid views (#4347): where
// each entry sits (day column, vertical position/height) and, for entries
// that overlap in time on the same day, which of the day's side-by-side
// columns it takes. No DOM: every value is a fraction or an index a Svelte
// component turns into pixels.

import type { CalendarEntry } from "./calendarEntries";

const DAY_MS = 86_400_000;
const DEFAULT_TIMED_DURATION_MS = 30 * 60 * 1000;
const MIN_TIMED_DURATION_MS = 60 * 1000;

export interface TimedPlacement {
    entry: CalendarEntry;
    dayIndex: number;
    /** 0..1 within the day column. */
    startFraction: number;
    /** 0..1 within the day column; always > startFraction. */
    endFraction: number;
    /** Which of the day's overlap columns this entry occupies. */
    columnIndex: number;
    /** Total overlap columns in this entry's cluster; 1 means it has the day's full width. */
    columnCount: number;
}

export interface AllDayPlacement {
    entry: CalendarEntry;
    dayIndex: number;
    /** How many grid day-columns this entry spans, clipped to the visible range. */
    spanDays: number;
}

export interface MilestonePlacement {
    entry: CalendarEntry;
    dayIndex: number;
}

export interface TimeGridLayout {
    dayCount: number;
    timed: TimedPlacement[];
    allDay: AllDayPlacement[];
    milestones: MilestonePlacement[];
}

interface OverlapItem {
    id: string;
    start: number;
    end: number;
}

/**
 * Greedy interval-graph column assignment, per connected overlap cluster.
 * Entries that do not overlap anything else in the day land in their own
 * cluster with `columnCount: 1` (the day's full width); entries that do
 * overlap split the width only within their own cluster, not the whole day.
 */
function assignOverlapColumns(items: OverlapItem[]): Map<string, { columnIndex: number; columnCount: number; }> {
    const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
    const result = new Map<string, { columnIndex: number; columnCount: number; }>();

    let cluster: OverlapItem[] = [];
    let clusterEnd = -Infinity;

    const flush = () => {
        if (cluster.length === 0) return;
        const columnEnds: number[] = [];
        const columnOf = new Map<string, number>();
        for (const item of cluster) {
            let column = columnEnds.findIndex((end) => end <= item.start);
            if (column === -1) {
                column = columnEnds.length;
                columnEnds.push(item.end);
            } else {
                columnEnds[column] = item.end;
            }
            columnOf.set(item.id, column);
        }
        const columnCount = columnEnds.length;
        for (const item of cluster) result.set(item.id, { columnIndex: columnOf.get(item.id)!, columnCount });
        cluster = [];
    };

    for (const item of sorted) {
        if (cluster.length > 0 && item.start >= clusterEnd) flush();
        cluster.push(item);
        clusterEnd = Math.max(clusterEnd, item.end);
    }
    flush();

    return result;
}

/**
 * Lay out `entries` over the visible `[rangeStart, rangeEnd)` window (UTC ms,
 * as computed by calendarGridRange.ts). All-day entries and due-only
 * milestones are returned separately from timed entries so a caller can
 * render the former in a fixed band and the latter in the scrolling grid.
 *
 * A timed entry is rendered on the single day it starts, clipped to that
 * day's bounds — an entry crossing midnight is not split across two day
 * columns in this pass.
 */
export function layoutTimeGrid(entries: CalendarEntry[], rangeStart: number, rangeEnd: number): TimeGridLayout {
    const dayCount = Math.round((rangeEnd - rangeStart) / DAY_MS);
    const timedByDay = new Map<number, OverlapItem[]>();
    const entryById = new Map<string, CalendarEntry>();
    const allDay: AllDayPlacement[] = [];
    const milestones: MilestonePlacement[] = [];

    for (const entry of entries) {
        if (entry.startMs === undefined) {
            if (entry.dueMs !== undefined && entry.dueMs >= rangeStart && entry.dueMs < rangeEnd) {
                milestones.push({ entry, dayIndex: Math.floor((entry.dueMs - rangeStart) / DAY_MS) });
            }
            continue;
        }

        const start = entry.startMs;
        const minDuration = entry.allDay ? DAY_MS : MIN_TIMED_DURATION_MS;
        const duration = Math.max(entry.durationMs ?? (entry.allDay ? DAY_MS : DEFAULT_TIMED_DURATION_MS), minDuration);
        const end = start + duration;

        // Overlap idiom (docs/crdt-sql-architecture.md §6.4): an entry that
        // starts before the window and overlaps into it is still shown.
        if (!(start < rangeEnd && end > rangeStart)) continue;

        if (entry.allDay) {
            const clippedStart = Math.max(start, rangeStart);
            const clippedEnd = Math.min(end, rangeEnd);
            const dayIndex = Math.floor((clippedStart - rangeStart) / DAY_MS);
            const spanDays = Math.max(1, Math.round((clippedEnd - clippedStart) / DAY_MS));
            allDay.push({ entry, dayIndex, spanDays });
            continue;
        }

        const dayIndex = Math.floor((start - rangeStart) / DAY_MS);
        if (dayIndex < 0 || dayIndex >= dayCount) continue;
        const dayStart = rangeStart + dayIndex * DAY_MS;
        const dayEnd = dayStart + DAY_MS;
        const clippedStart = Math.max(start, dayStart);
        const clippedEnd = Math.min(end, dayEnd);

        entryById.set(entry.key, entry);
        const list = timedByDay.get(dayIndex) ?? [];
        list.push({ id: entry.key, start: clippedStart, end: clippedEnd });
        timedByDay.set(dayIndex, list);
    }

    const timed: TimedPlacement[] = [];
    for (const [dayIndex, items] of timedByDay) {
        const dayStart = rangeStart + dayIndex * DAY_MS;
        const columns = assignOverlapColumns(items);
        for (const item of items) {
            const column = columns.get(item.id)!;
            timed.push({
                entry: entryById.get(item.id)!,
                dayIndex,
                startFraction: (item.start - dayStart) / DAY_MS,
                endFraction: (item.end - dayStart) / DAY_MS,
                columnIndex: column.columnIndex,
                columnCount: column.columnCount,
            });
        }
    }

    return { dayCount, timed, allDay, milestones };
}
