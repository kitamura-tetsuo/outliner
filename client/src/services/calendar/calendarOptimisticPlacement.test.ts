import { describe, expect, it } from "vitest";
import type { CalendarEntry } from "./calendarEntries";
import {
    applyOptimisticOverrides,
    clearOptimisticOverride,
    createOptimisticOverrides,
    reconcileOptimisticOverrides,
    setOptimisticOverride,
} from "./calendarOptimisticPlacement";

function entry(key: string, startMs: number, durationMs?: number): CalendarEntry {
    return { key, title: "t", startMs, durationMs, raw: {} };
}

describe("calendarOptimisticPlacement", () => {
    it("applies a pending override's start/duration on top of the entry", () => {
        const overrides = setOptimisticOverride(createOptimisticOverrides(), "a", { startMs: 1000 });
        const [placed] = applyOptimisticOverrides([entry("a", 0)], overrides);
        expect(placed.startMs).toBe(1000);
    });

    it("leaves entries with no pending override untouched", () => {
        const overrides = setOptimisticOverride(createOptimisticOverrides(), "a", { startMs: 1000 });
        const [placed] = applyOptimisticOverrides([entry("b", 0)], overrides);
        expect(placed.startMs).toBe(0);
    });

    it("replaces a prior pending override for the same entry rather than merging it", () => {
        let overrides = setOptimisticOverride(createOptimisticOverrides(), "a", { startMs: 1000, durationMs: 500 });
        overrides = setOptimisticOverride(overrides, "a", { startMs: 2000 });
        const [placed] = applyOptimisticOverrides([entry("a", 0, 100)], overrides);
        expect(placed.startMs).toBe(2000);
        // durationMs was not part of the replacing override, so it falls
        // back to the entry's own value, not the discarded first override.
        expect(placed.durationMs).toBe(100);
    });

    it("a rejected write clears the override, reverting the entry to its original position", () => {
        let overrides = setOptimisticOverride(createOptimisticOverrides(), "a", { startMs: 1000 });
        overrides = clearOptimisticOverride(overrides, "a");
        const [placed] = applyOptimisticOverrides([entry("a", 0)], overrides);
        expect(placed.startMs).toBe(0);
    });

    it("reconciliation drops an override once its entry appears in a fresh result, matching or not", () => {
        const overrides = setOptimisticOverride(createOptimisticOverrides(), "a", { startMs: 1000 });
        // The fresh result disagrees with the optimistic placement (a
        // concurrent remote move) — the query result still wins.
        const next = reconcileOptimisticOverrides(overrides, [entry("a", 9999)]);
        expect(next.has("a")).toBe(false);
    });

    it("reconciliation keeps an override whose entry has not reappeared yet", () => {
        const overrides = setOptimisticOverride(createOptimisticOverrides(), "a", { startMs: 1000 });
        const next = reconcileOptimisticOverrides(overrides, [entry("b", 0)]);
        expect(next.has("a")).toBe(true);
    });

    it("reconciliation is a no-op (same reference) when nothing changes", () => {
        const overrides = setOptimisticOverride(createOptimisticOverrides(), "a", { startMs: 1000 });
        const next = reconcileOptimisticOverrides(overrides, [entry("b", 0)]);
        expect(next).toBe(overrides);
    });

    it("never grows unbounded: each reconciled entry drops exactly once", () => {
        let overrides = createOptimisticOverrides();
        overrides = setOptimisticOverride(overrides, "a", { startMs: 1 });
        overrides = setOptimisticOverride(overrides, "b", { startMs: 2 });
        overrides = reconcileOptimisticOverrides(overrides, [entry("a", 1)]);
        expect(overrides.size).toBe(1);
        overrides = reconcileOptimisticOverrides(overrides, [entry("b", 2)]);
        expect(overrides.size).toBe(0);
    });
});
