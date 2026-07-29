// Optimistic placement for a dragged/resized/keyboard-moved calendar entry
// (#4347's "Feedback model: optimistic placement").
//
// The write path is Yjs -> observer -> PGlite -> debounced re-query, which is
// not instantaneous. A card must move on drop, with the next query result
// reconciling it, rather than waiting for the round trip (which produces a
// visible snap-back followed by a jump). This module is the pure state
// machine behind that: it holds no DOM, no timers, and no knowledge of Svelte
// — a component wraps it in `$state` and calls these functions.

import type { CalendarEntry } from "./calendarEntries";

export interface OptimisticOverride {
    /** New start instant, when the move/drag changed the start. */
    startMs?: number;
    /** New duration, when a resize changed it. */
    durationMs?: number;
    /** Raw query columns changed by a write, such as a grouping axis after a lane drop. */
    raw?: Record<string, unknown>;
}

export type OptimisticOverrides = Map<string, OptimisticOverride>;

export function createOptimisticOverrides(): OptimisticOverrides {
    return new Map();
}

/** Record an optimistic placement for `key`, replacing any prior pending one for the same entry. */
export function setOptimisticOverride(
    overrides: OptimisticOverrides,
    key: string,
    override: OptimisticOverride,
): OptimisticOverrides {
    const next = new Map(overrides);
    next.set(key, override);
    return next;
}

/**
 * A rejected write reverts visibly: drop the pending override for `key` so
 * the entry's rendered position falls back to the last real query result.
 */
export function clearOptimisticOverride(overrides: OptimisticOverrides, key: string): OptimisticOverrides {
    if (!overrides.has(key)) return overrides;
    const next = new Map(overrides);
    next.delete(key);
    return next;
}

/**
 * Drop positional overrides when their entry is present in a fresh query
 * result (the query is authoritative for concurrent moves). Raw-column
 * overrides wait until those written columns appear, because the relation
 * projection may briefly return its pre-write row while its observer flushes.
 */
export function reconcileOptimisticOverrides(
    overrides: OptimisticOverrides,
    freshEntries: CalendarEntry[],
): OptimisticOverrides {
    if (overrides.size === 0) return overrides;
    const freshByKey = new Map(freshEntries.map((entry) => [entry.key, entry]));
    let changed = false;
    const next = new Map(overrides);
    for (const key of overrides.keys()) {
        const fresh = freshByKey.get(key);
        if (!fresh) continue;
        const override = overrides.get(key)!;
        // A relation projection can briefly return the pre-write row while
        // its Yjs observer is still flushing to PGlite. Keep raw-column
        // mirrors through that stale result; clear them once those columns
        // are actually reflected. Positional overrides retain the original
        // "fresh query wins" behavior for concurrent drag reconciliation.
        const rawMatches = !override.raw
            || Object.entries(override.raw).every(([column, value]) => fresh.raw[column] === value);
        if (rawMatches) {
            next.delete(key);
            changed = true;
        }
    }
    return changed ? next : overrides;
}

/** Apply pending overrides on top of a fresh entry list, for rendering. */
export function applyOptimisticOverrides(
    entries: CalendarEntry[],
    overrides: OptimisticOverrides,
): CalendarEntry[] {
    if (overrides.size === 0) return entries;
    return entries.map((entry) => {
        const override = overrides.get(entry.key);
        if (!override) return entry;
        return {
            ...entry,
            startMs: override.startMs ?? entry.startMs,
            durationMs: override.durationMs ?? entry.durationMs,
            raw: override.raw ? { ...entry.raw, ...override.raw } : entry.raw,
        };
    });
}
