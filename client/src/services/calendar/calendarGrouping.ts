// Pure grouping of a calendar's result rows into lanes (#4348).
//
// Grouping is a client-side operation over result rows, never SQL `GROUP BY`
// (docs/crdt-sql-architecture.md §6.3): aggregation collapses row identity and
// makes the whole result read-only (§4.4), which would cost the calendar
// every one of its affordances. A group axis is just a result column the user
// assigned the group role (#4344) — grouping by another column requires no
// query change, only reassigning the role.
//
// A grouping axis may be multi-valued (e.g. `tags`, shipped JSON-encoded per
// §4.7): an item with two tags appears in both lanes. Detection is
// deliberately structural rather than configured — a value that parses as a
// JSON array of strings is treated as a membership set; anything else
// (including a plain scalar column like `source_kind`) is a single value.
// This mirrors the rest of the calendar's "shallow but safe" analyses
// (calendarColumnWritability.ts, the range-injection warning of §6.4): a
// false negative here just treats a multi-valued column as scalar, which
// only under-splits membership rather than fabricating lanes that don't exist.
//
// The NULL/empty lane (an entry with no value for the axis) always sorts
// last, regardless of the configured lane order — see `sortLaneValues`.

import type { CalendarEntry } from "./calendarEntries";

export interface CalendarLane {
    /** This lane's own value at its level; undefined is the NULL/empty lane. */
    value: string | undefined;
    /** Every ancestor value down to and including this lane, for a combined label. */
    path: (string | undefined)[];
    /** Present (possibly empty) only at the deepest configured level — a leaf lane. */
    entries: CalendarEntry[];
    /** Present only when more grouping axes remain below this level. */
    children?: CalendarLane[];
}

export interface GroupingOptions {
    /**
     * Preferred order for lane values, most-preferred first. Applied to the
     * top-level axis; nested levels (a second, third, ... grouping axis) fall
     * back to locale order, since the calendar exposes a single lane-order
     * control (docs/crdt-sql-architecture.md §6.3) and multi-level grouping is
     * the less common case. A value absent from this list sorts after every
     * listed value and before the NULL lane.
     */
    laneOrder?: string[];
    /**
     * When false (the default), a lane with no current entries is omitted
     * entirely rather than rendered empty — e.g. a `laneOrder` entry for a tag
     * nothing currently carries. A lane that has at least one entry is always
     * shown regardless of this flag.
     */
    showEmptyLanes?: boolean;
}

/** Parse a raw cell value into the set of lane values an entry belongs to for one axis. */
function axisValues(raw: unknown): (string | undefined)[] {
    if (raw === null || raw === undefined) return [undefined];
    if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (trimmed === "") return [undefined];
        if (trimmed.startsWith("[")) {
            try {
                const parsed: unknown = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    const values = Array.from(
                        new Set(parsed.filter((v): v is string => typeof v === "string").map((v) => v.trim())),
                    ).filter((v) => v !== "");
                    return values.length > 0 ? values : [undefined];
                }
            } catch {
                // Not actually JSON despite the leading bracket — fall through
                // and treat the raw text as a single scalar value below.
            }
        }
        return [trimmed];
    }
    return [String(raw)];
}

/** Every distinct lane value an entry belongs to for `axis`, reading its raw row. */
export function entryAxisValues(entry: Pick<CalendarEntry, "raw">, axis: string): (string | undefined)[] {
    return axisValues(entry.raw[axis]);
}

/**
 * Whether `axis`'s raw value on this entry is JSON-array-encoded (tags-like,
 * multi-valued) rather than a single scalar. Shared with
 * `calendarLaneWrite.ts`, which needs the same structural check to decide
 * between a whole-value replace and an `UPDATE_APPEND` add.
 */
export function isMultiValuedAxis(entry: Pick<CalendarEntry, "raw">, axis: string): boolean {
    const raw = entry.raw[axis];
    if (typeof raw !== "string") return false;
    const trimmed = raw.trim();
    if (!trimmed.startsWith("[")) return false;
    try {
        return Array.isArray(JSON.parse(trimmed));
    } catch {
        return false;
    }
}

/** Sort lane values: configured order first, then locale order, then the NULL lane last. */
function sortLaneValues(values: (string | undefined)[], laneOrder: string[]): (string | undefined)[] {
    const orderIndex = new Map(laneOrder.map((v, i) => [v, i]));
    const named = values.filter((v): v is string => v !== undefined);
    named.sort((a, b) => {
        const ia = orderIndex.get(a);
        const ib = orderIndex.get(b);
        if (ia !== undefined && ib !== undefined) return ia - ib;
        if (ia !== undefined) return -1;
        if (ib !== undefined) return 1;
        return a.localeCompare(b);
    });
    return values.includes(undefined) ? [...named, undefined] : named;
}

function partitionByAxis(entries: CalendarEntry[], axis: string): Map<string | undefined, CalendarEntry[]> {
    const map = new Map<string | undefined, CalendarEntry[]>();
    for (const entry of entries) {
        for (const value of entryAxisValues(entry, axis)) {
            const bucket = map.get(value);
            if (bucket) bucket.push(entry);
            else map.set(value, [entry]);
        }
    }
    return map;
}

function buildLevel(
    entries: CalendarEntry[],
    axes: string[],
    options: GroupingOptions,
    path: (string | undefined)[],
    isTopLevel: boolean,
): CalendarLane[] {
    const [axis, ...rest] = axes;
    const map = partitionByAxis(entries, axis);
    const laneOrder = isTopLevel ? options.laneOrder ?? [] : [];
    const knownValues = new Set(map.keys());
    for (const value of laneOrder) knownValues.add(value);

    const ordered = sortLaneValues(Array.from(knownValues), laneOrder);
    const showEmptyLanes = options.showEmptyLanes ?? false;

    const lanes: CalendarLane[] = [];
    for (const value of ordered) {
        const laneEntries = map.get(value) ?? [];
        if (laneEntries.length === 0 && !showEmptyLanes) continue;
        const lanePath = [...path, value];
        if (rest.length === 0) {
            lanes.push({ value, path: lanePath, entries: laneEntries });
        } else {
            lanes.push({ value, path: lanePath, entries: [], children: buildLevel(laneEntries, rest, options, lanePath, false) });
        }
    }
    return lanes;
}

/**
 * Group `entries` by `groupAxes`, one lane per distinct value (or combination
 * of values, for more than one axis) — never via SQL `GROUP BY`. An empty
 * `groupAxes` yields a single ungrouped lane carrying every entry, so a caller
 * can render lanes unconditionally.
 */
export function groupCalendarEntries(
    entries: CalendarEntry[],
    groupAxes: string[],
    options: GroupingOptions = {},
): CalendarLane[] {
    if (groupAxes.length === 0) return [{ value: undefined, path: [], entries }];
    return buildLevel(entries, groupAxes, options, [], true);
}

/** Every leaf entry under `lane`, including nested children's. */
export function flattenLaneEntries(lane: CalendarLane): CalendarEntry[] {
    if (!lane.children) return lane.entries;
    return lane.children.flatMap(flattenLaneEntries);
}

/** A lane path collapsed to one label, e.g. for month view's colour-coding (§6.3's "not a layout" rule). */
export function collapseLanePath(path: (string | undefined)[]): string {
    return path.map((v) => v ?? "(none)").join(" / ");
}
