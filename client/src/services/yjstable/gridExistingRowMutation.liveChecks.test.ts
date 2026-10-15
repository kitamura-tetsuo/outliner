import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createGrid, getGridRegistry } from "./gridDocs";
import { createMutationHarness, createTestTable } from "./gridExistingRowMutation.testSupport";
import { resetPgliteForTests } from "./pgliteService";
import { deleteRecord, setSchemaText } from "./tableDocs";
import { resetTableEngineForTests } from "./tableEngine";

afterEach(async () => await resetTableEngineForTests());
afterAll(async () => await resetPgliteForTests());

describe("Grid mutation live target checks", { timeout: 30_000 }, () => {
    it("refuses when the target record disappears after capture", async () => {
        const doc = new Y.Doc({ guid: "grid-write-missing-record" });
        const b = createTestTable(doc, "b", "CREATE TABLE b (id TEXT PRIMARY KEY, value TEXT)", "b1", {
            value: "before",
        });
        const h = await createMutationHarness(doc, "SELECT id, value FROM b");
        try {
            const pending = h.boundary.captureUpdate(0, "value", "after");
            deleteRecord(b.handles, "b1");
            const historyAfterDelete = b.handles.undo.undoStack.length;
            await expect(h.boundary.commit(pending)).rejects.toThrow(/authority changed|does not exist/);
            expect(b.handles.data.has("b1")).toBe(false);
            expect(b.handles.undo.undoStack).toHaveLength(historyAfterDelete);
        } finally {
            h.dispose();
        }
    });

    it("refuses when the physical field disappears after capture", async () => {
        const doc = new Y.Doc({ guid: "grid-write-missing-field" });
        const b = createTestTable(doc, "b", "CREATE TABLE b (id TEXT PRIMARY KEY, value TEXT, peer TEXT)", "b1", {
            value: "before",
            peer: "keep",
        });
        const h = await createMutationHarness(doc, "SELECT id, value FROM b");
        try {
            const pending = h.boundary.captureUpdate(0, "value", "after");
            setSchemaText(b.handles, "CREATE TABLE b (id TEXT PRIMARY KEY, peer TEXT)");
            const historyAfterSchema = b.handles.undo.undoStack.length;
            await expect(h.boundary.commit(pending)).rejects.toThrow(/authority changed|physical identity|writable/);
            expect(b.handles.data.get("b1")?.toJSON()).toEqual({ id: "b1", value: "before", peer: "keep" });
            expect(b.handles.undo.undoStack).toHaveLength(historyAfterSchema);
        } finally {
            h.dispose();
        }
    });

    it("rechecks invoking-surface permission before the provider effect", async () => {
        const doc = new Y.Doc({ guid: "grid-write-surface-revoked" });
        const b = createTestTable(doc, "b", "CREATE TABLE b (id TEXT PRIMARY KEY, value TEXT)", "b1", {
            value: "before",
        });
        const h = await createMutationHarness(doc, "SELECT id, value FROM b");
        try {
            const pending = h.boundary.captureUpdate(0, "value", "after");
            h.setAllowed(false);
            await expect(h.boundary.commit(pending)).rejects.toThrow(/no longer allows/);
            expect(b.handles.data.get("b1")?.get("value")).toBe("before");
            expect(b.handles.undo.undoStack).toHaveLength(0);
        } finally {
            h.dispose();
        }
    });

    it("ignores a saved INSERT target preference for existing-row authority", async () => {
        const doc = new Y.Doc({ guid: "grid-write-insert-preference" });
        const b = createTestTable(doc, "b", "CREATE TABLE b (id TEXT PRIMARY KEY, value TEXT, peer TEXT)", "b1", {
            value: "before",
            peer: "keep",
        });
        const other = createTestTable(doc, "other", "CREATE TABLE other (id TEXT PRIMARY KEY, value TEXT)", "o1", {
            value: "other",
        });
        const gridId = createGrid(doc, "Grid", b.tableId, "SELECT id, value, peer FROM b");
        const h = await createMutationHarness(doc, "SELECT id, value, peer FROM b");
        try {
            const pending = h.boundary.captureUpdate(0, "value", "after");
            getGridRegistry(doc).get(gridId)!.set("insertTargetTableId", other.tableId);
            await h.boundary.commit(pending);
            expect(b.handles.data.get("b1")?.toJSON()).toEqual({ id: "b1", value: "after", peer: "keep" });
            expect(other.handles.data.get("o1")?.get("value")).toBe("other");
        } finally {
            h.dispose();
        }
    });
});
