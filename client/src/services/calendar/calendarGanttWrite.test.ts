import { Project } from "$shared/app-schema";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import type { CalendarEntry } from "./calendarEntries";
import { layoutGantt } from "./calendarGanttLayout";
import { analyzeGanttSubtreeShift, applyGanttSubtreeShift } from "./calendarGanttWrite";

const DAY = 86_400_000;
const T0 = Date.parse("2026-03-01T00:00:00Z");

describe("analyzeGanttSubtreeShift", () => {
    const WRITABLE_COLUMNS = new Map([["start", "start_at"]]);
    const ROLES = { roleStart: "start" };

    it("collects the root plus every start-bearing descendant, skipping structural/due-only members", () => {
        const parentEntry: CalendarEntry = {
            key: "p",
            sourceKind: "outline_items",
            sourceId: "p",
            title: "Parent",
            raw: {},
        };
        const childEntry: CalendarEntry = {
            key: "c",
            sourceKind: "outline_items",
            sourceId: "c",
            parentId: "p",
            title: "Child",
            startMs: T0,
            allDay: false,
            raw: {},
        };
        const dueOnlyEntry: CalendarEntry = {
            key: "d",
            sourceKind: "outline_items",
            sourceId: "d",
            parentId: "p",
            title: "Deadline",
            dueMs: T0 + 5 * DAY,
            raw: {},
        };
        const entryByKey = new Map([[parentEntry.key, parentEntry], [childEntry.key, childEntry], [
            dueOnlyEntry.key,
            dueOnlyEntry,
        ]]);
        const { rows } = layoutGantt([parentEntry, childEntry, dueOnlyEntry], []);
        const parentRow = rows!.find((r) => r.key === "p")!;

        const analysis = analyzeGanttSubtreeShift(parentRow, entryByKey, ROLES, WRITABLE_COLUMNS);
        expect(analysis.shiftable).toBe(true);
        expect(analysis.members).toEqual([{ key: "c", allDay: false, startMs: T0 }]);
    });

    it("is not shiftable when any start-bearing descendant is unaddressable", () => {
        const parentEntry: CalendarEntry = {
            key: "p",
            sourceKind: "outline_items",
            sourceId: "p",
            title: "Parent",
            raw: {},
        };
        const unaddressableChild: CalendarEntry = {
            key: "c",
            parentId: "p",
            title: "Child",
            startMs: T0,
            allDay: false,
            raw: {},
            // no source_kind/source_id
        };
        const entryByKey = new Map([[parentEntry.key, parentEntry], [unaddressableChild.key, unaddressableChild]]);
        const { rows } = layoutGantt([parentEntry, unaddressableChild], []);
        const parentRow = rows!.find((r) => r.key === "p")!;

        const analysis = analyzeGanttSubtreeShift(parentRow, entryByKey, ROLES, WRITABLE_COLUMNS);
        expect(analysis.shiftable).toBe(false);
    });

    it("is not shiftable when the role resolves to a calculated (non-writable) column", () => {
        const parentEntry: CalendarEntry = {
            key: "p",
            sourceKind: "outline_items",
            sourceId: "p",
            title: "Parent",
            raw: {},
        };
        const childEntry: CalendarEntry = {
            key: "c",
            sourceKind: "outline_items",
            sourceId: "c",
            parentId: "p",
            title: "Child",
            startMs: T0,
            allDay: false,
            raw: {},
        };
        const entryByKey = new Map([[parentEntry.key, parentEntry], [childEntry.key, childEntry]]);
        const { rows } = layoutGantt([parentEntry, childEntry], []);
        const parentRow = rows!.find((r) => r.key === "p")!;

        const analysis = analyzeGanttSubtreeShift(parentRow, entryByKey, { roleStart: "bucket" }, WRITABLE_COLUMNS);
        expect(analysis.shiftable).toBe(false);
    });

    it("includes the root's own start when it carries one, alongside descendants", () => {
        const parentEntry: CalendarEntry = {
            key: "p",
            sourceKind: "outline_items",
            sourceId: "p",
            title: "Parent",
            startMs: T0 - DAY,
            allDay: false,
            raw: {},
        };
        const childEntry: CalendarEntry = {
            key: "c",
            sourceKind: "outline_items",
            sourceId: "c",
            parentId: "p",
            title: "Child",
            startMs: T0,
            allDay: false,
            raw: {},
        };
        const entryByKey = new Map([[parentEntry.key, parentEntry], [childEntry.key, childEntry]]);
        const { rows } = layoutGantt([parentEntry, childEntry], []);
        const parentRow = rows!.find((r) => r.key === "p")!;

        const analysis = analyzeGanttSubtreeShift(parentRow, entryByKey, ROLES, WRITABLE_COLUMNS);
        expect(analysis.members).toContainEqual({ key: "p", allDay: false, startMs: T0 - DAY });
        expect(analysis.members).toContainEqual({ key: "c", allDay: false, startMs: T0 });
    });
});

describe("applyGanttSubtreeShift — real Yjs project, one undo entry per drag", () => {
    it("shifts every member's start by the delta, preserving relative offsets", () => {
        const project = Project.createInstance("Test");
        const child1 = project.items.addNode("tester");
        const child2 = project.items.addNode("tester");
        child1.allDay = false;
        child1.start = new Date(T0).toISOString();
        child2.allDay = true;
        child2.start = "2026-03-05";

        applyGanttSubtreeShift(project, [
            { key: child1.key, allDay: false, startMs: T0 },
            { key: child2.key, allDay: true, startMs: Date.parse("2026-03-05T00:00:00Z") },
        ], 2 * DAY);

        expect(child1.start).toBe(new Date(T0 + 2 * DAY).toISOString());
        expect(child2.start).toBe("2026-03-07");
    });

    it("is a no-op for an empty member list or a zero delta", () => {
        const project = Project.createInstance("Test");
        const item = project.items.addNode("tester");
        item.start = new Date(T0).toISOString();

        applyGanttSubtreeShift(project, [], 5 * DAY);
        expect(item.start).toBe(new Date(T0).toISOString());

        applyGanttSubtreeShift(project, [{ key: item.key, allDay: false, startMs: T0 }], 0);
        expect(item.start).toBe(new Date(T0).toISOString());
    });

    it("skips a member whose item was concurrently deleted rather than throwing", () => {
        const project = Project.createInstance("Test");
        const survivor = project.items.addNode("tester");
        survivor.start = new Date(T0).toISOString();
        const deletedKey = "not-a-real-key";

        expect(() =>
            applyGanttSubtreeShift(project, [
                { key: deletedKey, allDay: false, startMs: T0 },
                { key: survivor.key, allDay: false, startMs: T0 },
            ], DAY)
        ).not.toThrow();
        expect(survivor.start).toBe(new Date(T0 + DAY).toISOString());
    });

    it("lands every member's write in a single Y.UndoManager stack item", () => {
        const project = Project.createInstance("Test");
        const child1 = project.items.addNode("tester");
        const child2 = project.items.addNode("tester");
        child1.allDay = false;
        child1.start = new Date(T0).toISOString();
        child2.allDay = false;
        child2.start = new Date(T0 + DAY).toISOString();

        // Mirrors store.svelte.ts's outline undo manager: default (null) origin only.
        const undoManager = new Y.UndoManager(project.ydoc.getMap("orderedTree"), { trackedOrigins: new Set([null]) });
        try {
            applyGanttSubtreeShift(project, [
                { key: child1.key, allDay: false, startMs: T0 },
                { key: child2.key, allDay: false, startMs: T0 + DAY },
            ], 3 * DAY);

            expect(undoManager.undoStack.length).toBe(1);

            undoManager.undo();
            expect(child1.start).toBe(new Date(T0).toISOString());
            expect(child2.start).toBe(new Date(T0 + DAY).toISOString());
        } finally {
            undoManager.destroy();
        }
    });
});
