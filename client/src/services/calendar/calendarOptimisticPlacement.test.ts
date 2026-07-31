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

    it("applies a pending raw grouping-column override without mutating the query row", () => {
        const original = { ...entry("a", 0), raw: { tags: '["work"]', id: "a" } };
        const overrides = setOptimisticOverride(createOptimisticOverrides(), "a", {
            raw: { tags: '["urgent"]' },
        });
        const [placed] = applyOptimisticOverrides([original], overrides);

        expect(placed.raw).toEqual({ tags: '["urgent"]', id: "a" });
        expect(original.raw).toEqual({ tags: '["work"]', id: "a" });
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

    it("reconciliation drops an override once its entry appears in a fresh result matching the override", () => {
        const overrides = setOptimisticOverride(createOptimisticOverrides(), "a", { startMs: 1000 });
        const next = reconcileOptimisticOverrides(overrides, [entry("a", 1000)]);
        expect(next.has("a")).toBe(false);
    });

    it("reconciliation keeps an override if the fresh result is stale (disagrees) up to 2 times, then drops on the 3rd", () => {
        let overrides = setOptimisticOverride(createOptimisticOverrides(), "a", { startMs: 1000 });

        // Pass 1: stale
        overrides = reconcileOptimisticOverrides(overrides, [entry("a", 0)]);
        expect(overrides.has("a")).toBe(true);
        expect(overrides.get("a")?.attempts).toBe(1);

        // Pass 2: stale
        overrides = reconcileOptimisticOverrides(overrides, [entry("a", 0)]);
        expect(overrides.has("a")).toBe(true);
        expect(overrides.get("a")?.attempts).toBe(2);

        // Pass 3: stale, drops
        overrides = reconcileOptimisticOverrides(overrides, [entry("a", 0)]);
        expect(overrides.has("a")).toBe(false);
    });

    it("reconciliation keeps an override whose entry has not reappeared yet", () => {
        const overrides = setOptimisticOverride(createOptimisticOverrides(), "a", { startMs: 1000 });
        const next = reconcileOptimisticOverrides(overrides, [entry("b", 0)]);
        expect(next.has("a")).toBe(true);
    });

    it("keeps a raw-column override through a stale projection and clears it after the projection catches up", () => {
        const overrides = setOptimisticOverride(createOptimisticOverrides(), "a", {
            raw: { tags: '["urgent"]' },
        });
        const stale = { ...entry("a", 0), raw: { tags: '["work"]' } };
        const pending = reconcileOptimisticOverrides(overrides, [stale]);
        expect(pending.has("a")).toBe(true);

        const current = { ...entry("a", 0), raw: { tags: '["urgent"]' } };
        expect(reconcileOptimisticOverrides(pending, [current]).has("a")).toBe(false);
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
