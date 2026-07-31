import { describe, expect, it } from "vitest";
import type { CalendarEntry } from "./calendarEntries";
import {
    applyOptimisticOverrides,
    clearOptimisticOverrideFields,
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

    it("merges a prior pending override for the same entry", () => {
        let overrides = setOptimisticOverride(createOptimisticOverrides(), "a", { startMs: 1000, durationMs: 500 });
        overrides = setOptimisticOverride(overrides, "a", { startMs: 2000 });
        const [placed] = applyOptimisticOverrides([entry("a", 0, 100)], overrides);
        expect(placed.startMs).toBe(2000);
        expect(placed.durationMs).toBe(500);
    });

    it("keeps both raw and startMs on lane drop then move", () => {
        let overrides = setOptimisticOverride(createOptimisticOverrides(), "a", { raw: { lane: "b" } });
        overrides = setOptimisticOverride(overrides, "a", { startMs: 2000 });
        const [placed] = applyOptimisticOverrides([entry("a", 0, 100)], overrides);
        expect(placed.startMs).toBe(2000);
        expect(placed.raw).toEqual({ lane: "b" });
    });

    it("a rejected write clears only the specified field, leaving others intact", () => {
        let overrides = setOptimisticOverride(createOptimisticOverrides(), "a", { startMs: 1000, durationMs: 500 });
        overrides = clearOptimisticOverrideFields(overrides, "a", ["durationMs"]);
        const [placed] = applyOptimisticOverrides([entry("a", 0, 100)], overrides);
        expect(placed.startMs).toBe(1000);
        expect(placed.durationMs).toBe(100);
    });

    it("clearing the last field drops the override entirely", () => {
        let overrides = setOptimisticOverride(createOptimisticOverrides(), "a", { startMs: 1000 });
        overrides = clearOptimisticOverrideFields(overrides, "a", ["startMs"]);
        expect(overrides.has("a")).toBe(false);
        const [placed] = applyOptimisticOverrides([entry("a", 0, 100)], overrides);
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
