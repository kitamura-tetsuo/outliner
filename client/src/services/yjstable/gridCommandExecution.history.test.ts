import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { executeGridWrites } from "./gridCommandExecution";
import { createMutationHarness, createTestTable } from "./gridExistingRowMutation.testSupport";
import { resetPgliteForTests } from "./pgliteService";
import { addRecord } from "./tableDocs";
import { resetTableEngineForTests } from "./tableEngine";

afterEach(async () => await resetTableEngineForTests());
afterAll(async () => await resetPgliteForTests());

describe("source-local Grid command history", { timeout: 30_000 }, () => {
    it("commits and undoes two same-Table guarded cells as one history step", async () => {
        const doc = new Y.Doc({ guid: "grid-command-history" });
        const table = createTestTable(
            doc,
            "items",
            "CREATE TABLE items (id TEXT PRIMARY KEY, value TEXT)",
            "one",
            { value: "first" },
        );
        addRecord(table.handles, { value: "second" }, "two");
        const harness = await createMutationHarness(doc, "SELECT id, value FROM items ORDER BY id");
        const targets = harness.evidence().rows.map((row, rowIndex) => ({ row, rowIndex, recordId: row.id as string }));
        try {
            table.handles.undo.clear();
            const outcome = await executeGridWrites(
                {
                    boundary: harness.boundary,
                    rowTargets: new Map(targets.map(target => [target.recordId, target])),
                },
                targets.map(target => ({ target: { rowTarget: target, columnId: "value" }, value: "changed" })),
            );

            expect(outcome.status).toBe("applied");
            expect(table.handles.data.get("one")?.get("value")).toBe("changed");
            expect(table.handles.data.get("two")?.get("value")).toBe("changed");
            expect(table.handles.undo.undoStack).toHaveLength(1);

            table.handles.undo.undo();
            expect(table.handles.data.get("one")?.get("value")).toBe("first");
            expect(table.handles.data.get("two")?.get("value")).toBe("second");
        } finally {
            harness.dispose();
        }
    });
});
