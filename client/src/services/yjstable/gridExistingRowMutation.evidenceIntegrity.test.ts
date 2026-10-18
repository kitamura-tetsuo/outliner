import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createMutationHarness, createTestTable } from "./gridExistingRowMutation.testSupport";
import { resetPgliteForTests } from "./pgliteService";
import { addRecord } from "./tableDocs";
import { resetTableEngineForTests } from "./tableEngine";

afterEach(async () => await resetTableEngineForTests());
afterAll(async () => await resetPgliteForTests());

describe("Grid mutation execution evidence integrity", { timeout: 30_000 }, () => {
    it("refuses a UNION row relabeled as another valid supplier", async () => {
        const doc = new Y.Doc({ guid: "grid-write-valid-supplier-forgery" });
        const a = createTestTable(doc, "a", "CREATE TABLE a (id TEXT PRIMARY KEY, value TEXT)", "same", {
            value: "A",
        });
        const b = createTestTable(doc, "b", "CREATE TABLE b (id TEXT PRIMARY KEY, value TEXT)", "same", {
            value: "B",
        });
        const query = "SELECT 'a' AS source_kind, id AS source_id, value FROM a "
            + "UNION ALL SELECT 'b', id, value FROM b ORDER BY value";
        const h = await createMutationHarness(doc, query);
        try {
            const aIndex = h.evidence().rows.findIndex(row => row.source_kind === "a");
            h.evidence().rows[aIndex]!.source_kind = "b";
            expect(() => h.boundary.captureUpdate(aIndex, "value", "forged")).toThrow(/completed execution/);
            expect(a.handles.data.get("same")?.get("value")).toBe("A");
            expect(b.handles.data.get("same")?.get("value")).toBe("B");
            expect(a.handles.undo.undoStack).toHaveLength(0);
            expect(b.handles.undo.undoStack).toHaveLength(0);
        } finally {
            h.dispose();
        }
    });

    it("refuses a plain result id changed to another existing record", async () => {
        const doc = new Y.Doc({ guid: "grid-write-plain-id-forgery" });
        const b = createTestTable(doc, "b", "CREATE TABLE b (id TEXT PRIMARY KEY, value TEXT)", "one", {
            value: "first",
        });
        addRecord(b.handles, { value: "second" }, "two");
        b.handles.undo.clear();
        const h = await createMutationHarness(doc, "SELECT id, value FROM b ORDER BY id");
        try {
            h.evidence().rows[0]!.id = "two";
            expect(() => h.boundary.captureUpdate(0, "value", "forged")).toThrow(/completed execution/);
            expect(b.handles.data.get("one")?.get("value")).toBe("first");
            expect(b.handles.data.get("two")?.get("value")).toBe("second");
            expect(b.handles.undo.undoStack).toHaveLength(0);
        } finally {
            h.dispose();
        }
    });

    it("refuses metadata from an earlier alias mapping, then writes only the current field", async () => {
        const doc = new Y.Doc({ guid: "grid-write-metadata-incarnation" });
        const b = createTestTable(
            doc,
            "b",
            "CREATE TABLE b (id TEXT PRIMARY KEY, first TEXT, second TEXT)",
            "b1",
            { first: "first-before", second: "second-before" },
        );
        const h = await createMutationHarness(doc, "SELECT id, first AS shown FROM b");
        try {
            const oldMetadata = h.metadata();
            await h.refresh("SELECT id, second AS shown FROM b");
            const currentMetadata = h.metadata();
            h.setMetadata(oldMetadata);
            expect(() => h.boundary.captureUpdate(0, "shown", "wrong")).toThrow(/does not belong/);
            expect(b.handles.data.get("b1")?.toJSON()).toEqual({
                id: "b1",
                first: "first-before",
                second: "second-before",
            });
            expect(b.handles.undo.undoStack).toHaveLength(0);

            h.setMetadata(currentMetadata);
            await h.boundary.commit(h.boundary.captureUpdate(0, "shown", "second-after"));
            expect(b.handles.data.get("b1")?.toJSON()).toEqual({
                id: "b1",
                first: "first-before",
                second: "second-after",
            });
        } finally {
            h.dispose();
        }
    });
});
