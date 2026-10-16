import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { planGridPaste } from "./gridClipboard";
import { executeGridPastePlan, executeGridRowDeletion, executeGridWrites } from "./gridCommandExecution";
import { createMutationHarness, createTestTable } from "./gridExistingRowMutation.testSupport";
import { GridSelection } from "./gridSelection";
import { planGridDeleteCommand, planSelectionClearWrites } from "./gridSelectionCommands";
import { resetPgliteForTests } from "./pgliteService";
import { addRecord } from "./tableDocs";
import { createTableEngineSession, resetTableEngineForTests } from "./tableEngine";

afterEach(async () => await resetTableEngineForTests());
afterAll(async () => await resetPgliteForTests());

describe("real Grid selection and clipboard command origins", { timeout: 30_000 }, () => {
    it("distinguishes cell clearing from row deletion and excludes computed cells", async () => {
        const doc = new Y.Doc({ guid: "grid-origin-delete" });
        const table = createTestTable(doc, "b", "CREATE TABLE b (id TEXT PRIMARY KEY, value TEXT)", "one", {
            value: "B",
        });
        const query = "SELECT id, value, value || '!' AS computed FROM b";
        const harness = await createMutationHarness(doc, query);
        const relationSession = createTableEngineSession({ projectDoc: doc });
        const row = harness.evidence().rows[0]!;
        const target = { row, rowIndex: 0, recordId: "one" };
        const ctx = {
            handles: table.handles,
            session: relationSession,
            rowTargets: new Map([["one", target]]),
            columnOrder: ["value", "computed"],
            editableColumns: new Set(["value"]),
            valueKindOf: () => "text" as const,
            checkOptionsOf: () => undefined,
            isNullableOf: () => true,
            guardedSourceWrites: true,
        };
        try {
            const cells = new GridSelection();
            cells.select({ rowId: "one", columnId: "value" });
            cells.extend({ rowId: "one", columnId: "computed" }, ["one"], ctx.columnOrder);
            const writes = planSelectionClearWrites(cells, ctx);
            expect(writes).toHaveLength(1);
            expect((await executeGridWrites({ boundary: harness.boundary, rowTargets: ctx.rowTargets }, writes)).status)
                .toBe("applied");
            expect(table.handles.data.has("one")).toBe(true);
            expect(table.handles.data.get("one")?.get("value")).toBe(null);

            await harness.refresh(query);
            const refreshed = harness.evidence().rows[0]!;
            const refreshedTarget = { row: refreshed, rowIndex: 0, recordId: "one" };
            const rows = new GridSelection();
            rows.selectRow("one", ["one"]);
            const rowCtx = { ...ctx, rowTargets: new Map([["one", refreshedTarget]]) };
            const plan = planGridDeleteCommand(rows, rowCtx);
            expect(plan.kind).toBe("remove-rows");
            if (plan.kind !== "remove-rows") throw new Error("expected row deletion plan");
            expect(
                (await executeGridRowDeletion(
                    { boundary: harness.boundary, rowTargets: rowCtx.rowTargets },
                    plan.targets,
                )).status,
            ).toBe("applied");
            expect(table.handles.data.has("one")).toBe(false);
        } finally {
            relationSession.dispose();
            harness.dispose();
        }
    });

    it("tiles a typed paste and refuses an invalid choice before history effects", async () => {
        const doc = new Y.Doc({ guid: "grid-origin-paste" });
        const table = createTestTable(
            doc,
            "b",
            "CREATE TABLE b (id TEXT PRIMARY KEY, status TEXT CHECK (status IN ('Open', 'Done')))",
            "one",
            { status: "Open" },
        );
        addRecord(table.handles, { status: "Open" }, "two");
        const harness = await createMutationHarness(doc, "SELECT id, status FROM b ORDER BY id");
        const relationSession = createTableEngineSession({ projectDoc: doc });
        const targets = harness.evidence().rows.map((row, rowIndex) => ({ row, rowIndex, recordId: row.id as string }));
        const rowTargets = new Map(targets.map(target => [target.recordId, target]));
        const ctx = {
            handles: table.handles,
            session: relationSession,
            rowTargets,
            columnOrder: ["status"],
            editableColumns: new Set(["status"]),
            valueKindOf: () => "select" as const,
            checkOptionsOf: () => ["Open", "Done"],
            isNullableOf: () => false,
            guardedSourceWrites: true,
        };
        try {
            const selection = new GridSelection();
            selection.select({ rowId: "one", columnId: "status" });
            selection.extend({ rowId: "two", columnId: "status" }, ["one", "two"], ["status"]);
            const plan = planGridPaste(selection, ctx, ["one", "two"], "Done");
            expect(plan.kind).toBe("apply");
            table.handles.undo.clear();
            expect((await executeGridPastePlan({ boundary: harness.boundary, rowTargets }, plan)).status).toBe(
                "applied",
            );
            expect(targets.map(target => table.handles.data.get(target.recordId)?.get("status"))).toEqual([
                "Done",
                "Done",
            ]);
            expect(table.handles.undo.undoStack).toHaveLength(1);

            await harness.refresh("SELECT id, status FROM b ORDER BY id");
            const invalid = planGridPaste(selection, ctx, ["one", "two"], "Missing");
            expect(invalid.kind).toBe("invalid-value");
            expect(table.handles.undo.undoStack).toHaveLength(1);
        } finally {
            relationSession.dispose();
            harness.dispose();
        }
    });
});
