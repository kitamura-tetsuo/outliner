import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { executeGridRowDeletion, executeGridWrites } from "./gridCommandExecution";
import { createMutationHarness, createTestTable } from "./gridExistingRowMutation.testSupport";
import { resetPgliteForTests } from "./pgliteService";
import { addRecord } from "./tableDocs";
import { resetTableEngineForTests } from "./tableEngine";

afterEach(async () => await resetTableEngineForTests());
afterAll(async () => await resetPgliteForTests());

describe("source-aware Grid command execution", { timeout: 30_000 }, () => {
    it("applies an ordered multi-cell plan only to SELECT B and keeps one local undo step", async () => {
        const doc = new Y.Doc({ guid: "grid-command-b" });
        const a = createTestTable(doc, "a", "CREATE TABLE a (id TEXT PRIMARY KEY, value TEXT)", "same", {
            value: "A",
        });
        const b = createTestTable(doc, "b", "CREATE TABLE b (id TEXT PRIMARY KEY, value TEXT)", "same", {
            value: "B",
        });
        const harness = await createMutationHarness(doc, "SELECT id, value FROM b");
        const target = { row: harness.evidence().rows[0]!, rowIndex: 0, recordId: "same" };
        const ctx = { boundary: harness.boundary, rowTargets: new Map([["same", target]]) };
        try {
            b.handles.undo.clear();
            const outcome = await executeGridWrites(ctx, [
                { target: { rowTarget: target, columnId: "value" }, value: "B2" },
            ]);
            expect(outcome.status).toBe("applied");
            expect(b.handles.data.get("same")?.get("value")).toBe("B2");
            expect(a.handles.data.get("same")?.get("value")).toBe("A");
            expect(b.handles.undo.undoStack).toHaveLength(1);
        } finally {
            harness.dispose();
        }
    });

    it("clears a non-null text cell to the empty string through the guarded boundary", async () => {
        const doc = new Y.Doc({ guid: "grid-command-clear-text" });
        const table = createTestTable(
            doc,
            "items",
            "CREATE TABLE items (id TEXT PRIMARY KEY, title TEXT NOT NULL)",
            "one",
            { title: "Alpha" },
        );
        const harness = await createMutationHarness(doc, "SELECT id, title FROM items");
        const target = { row: harness.evidence().rows[0]!, rowIndex: 0, recordId: "one" };
        try {
            const outcome = await executeGridWrites(
                { boundary: harness.boundary, rowTargets: new Map([["one", target]]) },
                [{ target: { rowTarget: target, columnId: "title" }, value: "" }],
            );
            expect(outcome.status).toBe("applied");
            expect(table.handles.data.get("one")?.get("title")).toBe("");
        } finally {
            harness.dispose();
        }
    });

    it("keeps an intended logical row when refreshed authority reorders the result", async () => {
        const doc = new Y.Doc({ guid: "grid-command-reorder" });
        const table = createTestTable(
            doc,
            "items",
            "CREATE TABLE items (id TEXT PRIMARY KEY, title TEXT)",
            "one",
            { title: "Alpha" },
        );
        addRecord(table.handles, { title: "Beta" }, "two");
        const harness = await createMutationHarness(doc, "SELECT id, title FROM items ORDER BY title");
        const displayedRows = harness.evidence().rows;
        const targets = displayedRows.map((row, rowIndex) => ({ row, rowIndex, recordId: row.id as string }));
        const intended = targets.find(target => target.recordId === "two")!;
        try {
            table.handles.data.get("one")!.set("title", "Zulu");
            await harness.refresh();
            expect(harness.evidence().rows[0]?.id).toBe("two");

            const outcome = await executeGridWrites(
                { boundary: harness.boundary, rowTargets: new Map(targets.map(target => [target.recordId, target])) },
                [{ target: { rowTarget: intended, columnId: "title" }, value: "Edited Beta" }],
            );

            expect(outcome.status).toBe("applied");
            expect(table.handles.data.get("two")?.get("title")).toBe("Edited Beta");
            expect(table.handles.data.get("one")?.get("title")).toBe("Zulu");
        } finally {
            harness.dispose();
        }
    });

    it("refuses the complete plan when authority changes during provider resolution", async () => {
        const doc = new Y.Doc({ guid: "grid-command-stale" });
        const b = createTestTable(doc, "b", "CREATE TABLE b (id TEXT PRIMARY KEY, value TEXT)", "one", {
            value: "before",
        });
        const harness = await createMutationHarness(doc, "SELECT id, value FROM b", { gatedResolution: true });
        const target = { row: harness.evidence().rows[0]!, rowIndex: 0, recordId: "one" };
        const ctx = { boundary: harness.boundary, rowTargets: new Map([["one", target]]) };
        try {
            b.handles.undo.clear();
            const pending = executeGridWrites(ctx, [
                { target: { rowTarget: target, columnId: "value" }, value: "after" },
            ]);
            await harness.resolutionPending;
            harness.session.setQuery("SELECT id, value FROM b WHERE value <> 'never'");
            harness.releaseResolution();
            const outcome = await pending;
            expect(outcome).toMatchObject({ status: "refused", applied: [] });
            expect(b.handles.data.get("one")?.get("value")).toBe("before");
            expect(b.handles.undo.undoStack).toHaveLength(0);
        } finally {
            harness.dispose();
        }
    });

    it("deletes only the captured logical row occurrences", async () => {
        const doc = new Y.Doc({ guid: "grid-command-delete" });
        const a = createTestTable(doc, "a", "CREATE TABLE a (id TEXT PRIMARY KEY, value TEXT)", "same", {
            value: "A",
        });
        const b = createTestTable(doc, "b", "CREATE TABLE b (id TEXT PRIMARY KEY, value TEXT)", "same", {
            value: "B",
        });
        const harness = await createMutationHarness(doc, "SELECT id, value FROM b");
        const target = { row: harness.evidence().rows[0]!, rowIndex: 0, recordId: "same" };
        try {
            const outcome = await executeGridRowDeletion(
                { boundary: harness.boundary, rowTargets: new Map([["same", target]]) },
                [target],
            );
            expect(outcome.status).toBe("applied");
            expect(b.handles.data.has("same")).toBe(false);
            expect(a.handles.data.has("same")).toBe(true);
        } finally {
            harness.dispose();
        }
    });

    it("reports the exact partial result after a later provider write fails", async () => {
        const doc = new Y.Doc({ guid: "grid-command-partial" });
        const table = createTestTable(doc, "b", "CREATE TABLE b (id TEXT PRIMARY KEY, value TEXT)", "one", {
            value: "first",
        });
        addRecord(table.handles, { value: "second" }, "two");
        const harness = await createMutationHarness(doc, "SELECT id, value FROM b ORDER BY id", { failWriteNumber: 2 });
        const targets = harness.evidence().rows.map((row, rowIndex) => ({ row, rowIndex, recordId: row.id as string }));
        const ctx = {
            boundary: harness.boundary,
            rowTargets: new Map(targets.map(target => [target.recordId, target])),
        };
        try {
            const outcome = await executeGridWrites(
                ctx,
                targets.map(target => ({
                    target: { rowTarget: target, columnId: "value" },
                    value: "changed",
                })),
            );
            expect(outcome.status).toBe("partial");
            if (outcome.status !== "partial") throw new Error("expected a partial outcome");
            expect(outcome.applied).toHaveLength(1);
            expect(outcome.failedIntent.rowIndex).toBe(1);
            expect(table.handles.data.get("one")?.get("value")).toBe("changed");
            expect(table.handles.data.get("two")?.get("value")).toBe("second");
        } finally {
            harness.dispose();
        }
    });
});
