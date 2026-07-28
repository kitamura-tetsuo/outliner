// Pure geometry and hierarchy for the Gantt view (#4350): one row per entry,
// a bar spanning start to derived end, nested by the outline hierarchy. No
// DOM: every value is an entry reference, a row depth, or a 0..1 fraction —
// the same "layout is a pure function over the result set" discipline
// calendarTimeGridLayout.ts and calendarMonthGridLayout.ts already follow.
//
// Hierarchy is the outline hierarchy (docs/crdt-sql-architecture.md §6.7):
// `outline_items` already carries `parent_id`, surfaced on `CalendarEntry`
// (calendarEntries.ts) whenever the calendar's query selects it. Nesting is
// therefore built from the *result rows actually present* — an item with no
// due/start of its own is never projected (§4.2), so it never appears as a
// row, and a chain of such undated intermediate items breaks visible nesting
// between a dated ancestor and a dated descendant. That is an accepted
// consequence of reusing the existing projection gate rather than widening
// it (out of scope for this issue) or fabricating synthetic rows with no
// writable origin.
//
// A rolled-up parent's bar is *derived*, not stored: it spans the earliest
// start to the latest end across its whole subtree (not just direct
// children — the computation is recursive, so a grandchild's span reaches
// the top). A parent's own `start`/`duration` are ignored for its bar once
// it has dated descendants; its own `due` (if any) still renders alongside,
// as an independent marker (§6.1's "bar plus marker").
//
// `due` and `start` are always independent markers/bars on the same row —
// never merged — matching §6.1: a row can show a bar (from start+duration),
// a due marker, both, or (for a bare start with no duration) a start point
// instead of a zero-width bar.
//
// When a grouping axis is active, grouping wins over hierarchy (§6.7): rows
// are flat, ordered by time within each lane, with no nesting and no
// roll-up — a rolled-up bar computed from only the children visible in one
// lane would mean different things in different lanes, which is exactly the
// "same data looks different depending on where you stand" failure this
// architecture removes everywhere else. This module does not depend on the
// (still separate, #4348) lane-grouping infrastructure: it groups directly
// by the calendar's first configured `groupAxes` column, which is all a flat
// Gantt row-section needs.

import type { CalendarEntry } from "./calendarEntries";

const DAY_MS = 86_400_000;

export interface GanttRow {
    /** Same as the underlying entry's key; stable across a requery. */
    key: string;
    entry: CalendarEntry;
    /** Nesting depth: 0 for a root or for any row in grouped (flat) mode. */
    depth: number;
    /** Direct child keys, in this row's own display order. Empty in grouped mode. */
    childKeys: string[];
    /** Every descendant key at any depth — what a subtree shift must move. */
    descendantKeys: string[];
    hasChildren: boolean;
    collapsed: boolean;
    /** True for a rollup row: its bar has no writable origin of its own — see calendarGanttWrite.ts. */
    isRollup: boolean;
    /** Set when this row has a real bar (own start+duration, or a rollup span). Exclusive end. */
    barStartMs?: number;
    barEndMs?: number;
    /** A `start` with no duration (and not all-day) is a point, not a zero-width bar (§6.1). */
    startPointMs?: number;
    /** The row's own `due`, an independent marker rendered alongside any bar. */
    dueMarkerMs?: number;
    /** The group lane this row belongs to, only set in grouped (flat) mode. */
    laneKey?: string;
}

export interface GanttLane {
    /** The lane's raw group-axis value, or undefined for the trailing NULL/empty lane. */
    key: string | undefined;
    rows: GanttRow[];
}

export interface GanttLayoutResult {
    /** True when a grouping axis is active: hierarchy is flattened, no roll-up (§6.7). */
    grouped: boolean;
    /** Populated when `grouped` is true: one row-section per lane, NULL/empty lane last. */
    lanes?: GanttLane[];
    /** Populated when `grouped` is false: the nested row list, depth-first. */
    rows?: GanttRow[];
}

interface GanttNode {
    entry: CalendarEntry;
    children: GanttNode[];
}

interface Occupancy {
    start: number;
    /** Exclusive; equals `start` for a point (a bare start with no duration). */
    end: number;
    hasBar: boolean;
}

/** Whether `entry.startMs` renders as a real bar (a duration, or all-day's implicit whole day). */
function hasRealBar(entry: CalendarEntry): boolean {
    return entry.startMs !== undefined && (entry.allDay === true || (entry.durationMs !== undefined && entry.durationMs > 0));
}

/** The time this entry's own `start` occupies, for rollup purposes. `due` never contributes (§6.1: not an allocation of time). */
function ownOccupancy(entry: CalendarEntry): Occupancy | undefined {
    if (entry.startMs === undefined) return undefined;
    if (hasRealBar(entry)) {
        const end = entry.allDay ? entry.startMs + Math.max(entry.durationMs ?? DAY_MS, DAY_MS) : entry.startMs + entry.durationMs!;
        return { start: entry.startMs, end, hasBar: true };
    }
    return { start: entry.startMs, end: entry.startMs, hasBar: false };
}

/**
 * Build the outline-hierarchy forest from the entries actually present. An
 * entry whose `parentId` does not match any other entry's `sourceId` in this
 * same result set becomes a root — including when its real outline parent
 * exists but is not itself a dated (projected) row.
 */
function buildForest(entries: CalendarEntry[]): GanttNode[] {
    const nodesByKey = new Map<string, GanttNode>();
    for (const entry of entries) nodesByKey.set(entry.key, { entry, children: [] });

    const bySourceId = new Map<string, GanttNode>();
    for (const entry of entries) {
        if (entry.sourceId !== undefined) bySourceId.set(entry.sourceId, nodesByKey.get(entry.key)!);
    }

    const roots: GanttNode[] = [];
    for (const entry of entries) {
        const node = nodesByKey.get(entry.key)!;
        const parent = entry.parentId !== undefined ? bySourceId.get(entry.parentId) : undefined;
        if (parent && parent !== node) parent.children.push(node);
        else roots.push(node);
    }
    return roots;
}

type RollupSpan = { startMs: number; endMs: number; } | undefined;

/** Recursive earliest-start/latest-end across a node's whole subtree (not just direct children). */
function computeRollup(node: GanttNode, cache: Map<string, RollupSpan>): RollupSpan {
    if (cache.has(node.entry.key)) return cache.get(node.entry.key);

    let start: number | undefined;
    let end: number | undefined;
    for (const child of node.children) {
        const childRollup = child.children.length > 0 ? computeRollup(child, cache) : undefined;
        const occ = childRollup ? { start: childRollup.startMs, end: childRollup.endMs } : ownOccupancy(child.entry);
        if (!occ) continue;
        if (start === undefined || occ.start < start) start = occ.start;
        if (end === undefined || occ.end > end) end = occ.end;
    }

    const span: RollupSpan = start !== undefined && end !== undefined ? { startMs: start, endMs: end } : undefined;
    cache.set(node.entry.key, span);
    return span;
}

function sortKey(node: GanttNode, rollup: Map<string, RollupSpan>): number {
    const span = rollup.get(node.entry.key);
    return span?.startMs ?? node.entry.startMs ?? node.entry.dueMs ?? Number.POSITIVE_INFINITY;
}

function collectDescendantKeys(node: GanttNode): string[] {
    const out: string[] = [];
    const walk = (n: GanttNode) => {
        for (const child of n.children) {
            out.push(child.entry.key);
            walk(child);
        }
    };
    walk(node);
    return out;
}

function rowFromNode(
    node: GanttNode,
    depth: number,
    rollup: Map<string, RollupSpan>,
    collapsedKeys: ReadonlySet<string>,
): GanttRow {
    const { entry } = node;
    const hasChildren = node.children.length > 0;
    const rollupSpan = hasChildren ? rollup.get(entry.key) : undefined;

    let barStartMs: number | undefined;
    let barEndMs: number | undefined;
    let startPointMs: number | undefined;
    let isRollup = false;

    if (rollupSpan) {
        barStartMs = rollupSpan.startMs;
        barEndMs = rollupSpan.endMs;
        isRollup = true;
    } else {
        const occ = ownOccupancy(entry);
        if (occ?.hasBar) {
            barStartMs = occ.start;
            barEndMs = occ.end;
        } else if (occ) {
            startPointMs = occ.start;
        }
    }

    return {
        key: entry.key,
        entry,
        depth,
        childKeys: node.children.map((c) => c.entry.key),
        descendantKeys: collectDescendantKeys(node),
        hasChildren,
        collapsed: hasChildren && collapsedKeys.has(entry.key),
        isRollup,
        barStartMs,
        barEndMs,
        startPointMs,
        dueMarkerMs: entry.dueMs,
    };
}

function flatten(
    nodes: GanttNode[],
    depth: number,
    rollup: Map<string, RollupSpan>,
    collapsedKeys: ReadonlySet<string>,
    out: GanttRow[],
): void {
    const sorted = [...nodes].sort((a, b) => sortKey(a, rollup) - sortKey(b, rollup));
    for (const node of sorted) {
        const row = rowFromNode(node, depth, rollup, collapsedKeys);
        out.push(row);
        if (row.hasChildren && !row.collapsed) flatten(node.children, depth + 1, rollup, collapsedKeys, out);
    }
}

/** Hierarchical (ungrouped) layout: nested rows with roll-up, depth-first, time-ordered siblings. */
function layoutHierarchy(entries: CalendarEntry[], collapsedKeys: ReadonlySet<string>): GanttRow[] {
    const roots = buildForest(entries);
    const rollup = new Map<string, RollupSpan>();
    for (const root of roots) if (root.children.length > 0) computeRollup(root, rollup);
    const rows: GanttRow[] = [];
    flatten(roots, 0, rollup, collapsedKeys, rows);
    return rows;
}

/** Flat (grouped) layout: no hierarchy, no roll-up — every row is a leaf of its own entry. */
function flatRow(entry: CalendarEntry, laneKey: string | undefined): GanttRow {
    const occ = ownOccupancy(entry);
    return {
        key: entry.key,
        entry,
        depth: 0,
        childKeys: [],
        descendantKeys: [],
        hasChildren: false,
        collapsed: false,
        isRollup: false,
        barStartMs: occ?.hasBar ? occ.start : undefined,
        barEndMs: occ?.hasBar ? occ.end : undefined,
        startPointMs: occ && !occ.hasBar ? occ.start : undefined,
        dueMarkerMs: entry.dueMs,
        laneKey,
    };
}

function rawColumnValue(entry: CalendarEntry, column: string): string | undefined {
    const value = entry.raw[column];
    if (value === null || value === undefined) return undefined;
    const text = String(value);
    return text === "" ? undefined : text;
}

function layoutGrouped(entries: CalendarEntry[], groupColumn: string): GanttLane[] {
    const laneOrder: (string | undefined)[] = [];
    const laneEntries = new Map<string | undefined, CalendarEntry[]>();
    for (const entry of entries) {
        const laneKey = rawColumnValue(entry, groupColumn);
        if (!laneEntries.has(laneKey)) {
            laneEntries.set(laneKey, []);
            laneOrder.push(laneKey);
        }
        laneEntries.get(laneKey)!.push(entry);
    }
    // The NULL/empty lane always sorts last; every other lane keeps its
    // first-seen order (a stable sort touches only the undefined entry).
    const named = laneOrder.filter((k) => k !== undefined);
    const hasEmpty = laneOrder.includes(undefined);
    const ordered = hasEmpty ? [...named, undefined] : named;

    return ordered.map((laneKey) => {
        const rows = laneEntries.get(laneKey)!
            .map((entry) => flatRow(entry, laneKey))
            .sort((a, b) => (a.entry.startMs ?? a.entry.dueMs ?? Infinity) - (b.entry.startMs ?? b.entry.dueMs ?? Infinity));
        return { key: laneKey, rows };
    });
}

/**
 * Lay out `entries` for the Gantt view. `groupAxes` mirrors the calendar's
 * own setting (calendarService.ts) — when non-empty, only the *first* axis
 * is used (a second axis would need multi-level lanes, out of scope here per
 * §6.7's own row-section table). `collapsedKeys` is per-viewer, local UI
 * state (never written to the project doc, per §6.7's "held locally like the
 * destination history" note).
 */
export function layoutGantt(
    entries: CalendarEntry[],
    groupAxes: string[],
    collapsedKeys: ReadonlySet<string> = new Set(),
): GanttLayoutResult {
    const groupColumn = groupAxes[0];
    if (groupColumn) return { grouped: true, lanes: layoutGrouped(entries, groupColumn) };
    return { grouped: false, rows: layoutHierarchy(entries, collapsedKeys) };
}

export interface GanttBarPlacement {
    row: GanttRow;
    /** 0..1 within [rangeStart, rangeEnd), clipped to the visible window. */
    startFraction: number;
    endFraction: number;
}

/**
 * Convert a row's bar into 0..1 fractions of the visible window, clipping to
 * it (the overlap idiom, §6.4: a bar that starts before the window and
 * overlaps into it is still shown, clipped at the edge). Rows with no bar
 * (a milestone-only or point-only row) are not placed here.
 */
export function placeGanttBar(row: GanttRow, rangeStart: number, rangeEnd: number): GanttBarPlacement | undefined {
    if (row.barStartMs === undefined || row.barEndMs === undefined) return undefined;
    if (!(row.barStartMs < rangeEnd && row.barEndMs > rangeStart)) return undefined;
    const clippedStart = Math.max(row.barStartMs, rangeStart);
    const clippedEnd = Math.min(row.barEndMs, rangeEnd);
    const span = rangeEnd - rangeStart;
    return {
        row,
        startFraction: (clippedStart - rangeStart) / span,
        endFraction: (clippedEnd - rangeStart) / span,
    };
}

/** Convert a single instant (a due marker or a start point) into a 0..1 fraction, or undefined outside the window. */
export function ganttInstantFraction(ms: number, rangeStart: number, rangeEnd: number): number | undefined {
    if (ms < rangeStart || ms >= rangeEnd) return undefined;
    return (ms - rangeStart) / (rangeEnd - rangeStart);
}
