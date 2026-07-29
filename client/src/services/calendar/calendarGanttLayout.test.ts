import { describe, expect, it } from "vitest";
import type { CalendarEntry } from "./calendarEntries";
import { ganttInstantFraction, layoutGantt, placeGanttBar } from "./calendarGanttLayout";

const DAY = 86_400_000;
const T0 = Date.parse("2026-03-01T00:00:00Z");

function entry(overrides: Partial<CalendarEntry> & { key: string; }): CalendarEntry {
    return {
        title: overrides.key,
        raw: {},
        sourceKind: "outline_items",
        sourceId: overrides.key,
        ...overrides,
    };
}

describe("layoutGantt — hierarchy (ungrouped)", () => {
    it("nests a child under its parent via parentId/sourceId and orders roots by start", () => {
        const parent = entry({ key: "p1", startMs: T0, durationMs: 5 * DAY });
        const child = entry({ key: "c1", parentId: "p1", startMs: T0 + DAY, durationMs: DAY });
        const other = entry({ key: "r2", startMs: T0 - DAY, durationMs: DAY });

        const { grouped, rows } = layoutGantt([parent, child, other], []);
        expect(grouped).toBe(false);
        const keys = rows!.map((r) => r.key);
        expect(keys).toEqual(["r2", "p1", "c1"]);
        expect(rows!.find((r) => r.key === "c1")!.depth).toBe(1);
        expect(rows!.find((r) => r.key === "p1")!.depth).toBe(0);
    });

    it("a parent's bar rolls up from its children's earliest start to latest end, not its own dates", () => {
        const parent = entry({ key: "p1", startMs: T0 + 10 * DAY, durationMs: DAY }); // parent's own dates are ignored for its bar
        const c1 = entry({ key: "c1", parentId: "p1", startMs: T0, durationMs: DAY });
        const c2 = entry({ key: "c2", parentId: "p1", startMs: T0 + 4 * DAY, durationMs: 2 * DAY });

        const { rows } = layoutGantt([parent, c1, c2], []);
        const parentRow = rows!.find((r) => r.key === "p1")!;
        expect(parentRow.isRollup).toBe(true);
        expect(parentRow.barStartMs).toBe(T0);
        expect(parentRow.barEndMs).toBe(T0 + 6 * DAY);
    });

    it("roll-up is recursive: a grandchild's span reaches the top-level parent", () => {
        const grandparent = entry({ key: "gp" });
        const parent = entry({ key: "p1", parentId: "gp" });
        const child = entry({ key: "c1", parentId: "p1", startMs: T0, durationMs: DAY });

        const { rows } = layoutGantt([grandparent, parent, child], []);
        const gpRow = rows!.find((r) => r.key === "gp")!;
        expect(gpRow.isRollup).toBe(true);
        expect(gpRow.barStartMs).toBe(T0);
        expect(gpRow.barEndMs).toBe(T0 + DAY);
    });

    it("recomputes the roll-up when a child's dates change", () => {
        const parent = entry({ key: "p1" });
        const before = layoutGantt(
            [parent, entry({ key: "c1", parentId: "p1", startMs: T0, durationMs: DAY })],
            [],
        ).rows!.find((r) => r.key === "p1")!;
        const after = layoutGantt(
            [parent, entry({ key: "c1", parentId: "p1", startMs: T0 + 5 * DAY, durationMs: DAY })],
            [],
        ).rows!.find((r) => r.key === "p1")!;
        expect(before.barStartMs).toBe(T0);
        expect(after.barStartMs).toBe(T0 + 5 * DAY);
    });

    it("a parent's own due still renders as a marker alongside its rolled-up bar", () => {
        const parent = entry({ key: "p1", dueMs: T0 + 20 * DAY });
        const child = entry({ key: "c1", parentId: "p1", startMs: T0, durationMs: DAY });
        const { rows } = layoutGantt([parent, child], []);
        const parentRow = rows!.find((r) => r.key === "p1")!;
        expect(parentRow.isRollup).toBe(true);
        expect(parentRow.dueMarkerMs).toBe(T0 + 20 * DAY);
    });

    it("an item becomes a rolled-up parent when it gains children and an ordinary bar when it loses them", () => {
        const parent = entry({ key: "p1", startMs: T0 + 10 * DAY, durationMs: DAY });
        const withChild = layoutGantt(
            [parent, entry({ key: "c1", parentId: "p1", startMs: T0, durationMs: DAY })],
            [],
        ).rows!.find((r) => r.key === "p1")!;
        expect(withChild.isRollup).toBe(true);
        expect(withChild.barStartMs).toBe(T0);

        const withoutChild = layoutGantt([parent], []).rows!.find((r) => r.key === "p1")!;
        expect(withoutChild.isRollup).toBe(false);
        expect(withoutChild.barStartMs).toBe(T0 + 10 * DAY);
    });

    it("an entry with no duration renders as a start point, not a zero-width bar", () => {
        const { rows } = layoutGantt([entry({ key: "e1", startMs: T0 })], []);
        const row = rows![0];
        expect(row.barStartMs).toBeUndefined();
        expect(row.startPointMs).toBe(T0);
    });

    it("a due-only entry renders as a milestone marker with no bar", () => {
        const { rows } = layoutGantt([entry({ key: "e1", dueMs: T0 })], []);
        const row = rows![0];
        expect(row.barStartMs).toBeUndefined();
        expect(row.startPointMs).toBeUndefined();
        expect(row.dueMarkerMs).toBe(T0);
    });

    it("a due-only child does not extend its parent's roll-up span (due is not an allocation of time)", () => {
        const parent = entry({ key: "p1" });
        const barChild = entry({ key: "c1", parentId: "p1", startMs: T0, durationMs: DAY });
        const dueOnlyChild = entry({ key: "c2", parentId: "p1", dueMs: T0 + 30 * DAY });
        const { rows } = layoutGantt([parent, barChild, dueOnlyChild], []);
        const parentRow = rows!.find((r) => r.key === "p1")!;
        expect(parentRow.barEndMs).toBe(T0 + DAY);
    });

    it("an item with no dates of its own but dated descendants breaks visible nesting to its own parent", () => {
        // "mid" has no due/start, so it would never be a projected row in the
        // first place; grandchild's parentId still points at "mid", which is
        // simply absent from the result set, so grandchild becomes a root.
        const root = entry({ key: "root", startMs: T0, durationMs: DAY });
        const grandchild = entry({ key: "gc", parentId: "mid", startMs: T0 + DAY, durationMs: DAY });
        const { rows } = layoutGantt([root, grandchild], []);
        expect(rows!.find((r) => r.key === "gc")!.depth).toBe(0);
    });

    it("collapsing a parent hides its descendants but keeps its own roll-up row and bar", () => {
        const parent = entry({ key: "p1" });
        const child = entry({ key: "c1", parentId: "p1", startMs: T0, durationMs: DAY });
        const { rows } = layoutGantt([parent, child], [], new Set(["p1"]));
        expect(rows!.map((r) => r.key)).toEqual(["p1"]);
        expect(rows![0].collapsed).toBe(true);
        expect(rows![0].barStartMs).toBe(T0); // roll-up is unaffected by collapse
    });
});

describe("layoutGantt — grouped (a group axis flattens hierarchy and disables roll-up)", () => {
    it("groups by the first axis's raw column value and drops nesting/roll-up", () => {
        const parent = entry({ key: "p1", raw: { bucket: "A" }, startMs: T0, durationMs: DAY });
        const child = entry({ key: "c1", parentId: "p1", raw: { bucket: "B" }, startMs: T0 + DAY, durationMs: DAY });
        const { grouped, lanes } = layoutGantt([parent, child], ["bucket"]);
        expect(grouped).toBe(true);
        expect(lanes!.map((l) => l.key)).toEqual(["A", "B"]);
        expect(lanes!.find((l) => l.key === "B")!.rows[0].depth).toBe(0);
        expect(lanes!.find((l) => l.key === "B")!.rows[0].isRollup).toBe(false);
    });

    it("puts the NULL/empty lane last regardless of first-seen order", () => {
        const a = entry({ key: "a", raw: { bucket: null } });
        const b = entry({ key: "b", raw: { bucket: "named" } });
        const { lanes } = layoutGantt([a, b], ["bucket"]);
        expect(lanes!.map((l) => l.key)).toEqual(["named", undefined]);
    });

    it("an empty-string bucket value is treated the same as NULL", () => {
        const { lanes } = layoutGantt([entry({ key: "a", raw: { bucket: "" } })], ["bucket"]);
        expect(lanes!.map((l) => l.key)).toEqual([undefined]);
    });
});

describe("placeGanttBar", () => {
    const rangeStart = T0;
    const rangeEnd = T0 + 10 * DAY;

    it("computes clipped start/end fractions for a bar fully inside the range", () => {
        const [row] = layoutGantt([entry({ key: "e1", startMs: T0 + 2 * DAY, durationMs: 2 * DAY })], []).rows!;
        const placement = placeGanttBar(row, rangeStart, rangeEnd);
        expect(placement!.startFraction).toBeCloseTo(0.2);
        expect(placement!.endFraction).toBeCloseTo(0.4);
    });

    it("clips a bar that starts before the window and overlaps into it", () => {
        const [row] = layoutGantt([entry({ key: "e1", startMs: T0 - 5 * DAY, durationMs: 6 * DAY })], []).rows!;
        const placement = placeGanttBar(row, rangeStart, rangeEnd);
        expect(placement!.startFraction).toBe(0);
        expect(placement!.endFraction).toBeCloseTo(0.1);
    });

    it("returns undefined for a bar entirely outside the window", () => {
        const [row] = layoutGantt([entry({ key: "e1", startMs: T0 - 5 * DAY, durationMs: DAY })], []).rows!;
        expect(placeGanttBar(row, rangeStart, rangeEnd)).toBeUndefined();
    });

    it("returns undefined for a row with no bar (a point-only row)", () => {
        const [row] = layoutGantt([entry({ key: "e1", startMs: T0 })], []).rows!;
        expect(placeGanttBar(row, rangeStart, rangeEnd)).toBeUndefined();
    });
});

describe("ganttInstantFraction", () => {
    it("computes a fraction inside the window", () => {
        expect(ganttInstantFraction(T0 + 5 * DAY, T0, T0 + 10 * DAY)).toBeCloseTo(0.5);
    });

    it("returns undefined outside the window", () => {
        expect(ganttInstantFraction(T0 - DAY, T0, T0 + 10 * DAY)).toBeUndefined();
        expect(ganttInstantFraction(T0 + 10 * DAY, T0, T0 + 10 * DAY)).toBeUndefined();
    });
});
