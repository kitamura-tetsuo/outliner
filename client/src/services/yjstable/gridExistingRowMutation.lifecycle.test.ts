import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createMutationHarness, createTestTable } from "./gridExistingRowMutation.testSupport";
import { resetPgliteForTests } from "./pgliteService";
import { removeTable, setSchemaText } from "./tableDocs";
import { resetTableEngineForTests } from "./tableEngine";

afterEach(async () => await resetTableEngineForTests());
afterAll(async () => await resetPgliteForTests());

describe("Grid mutation authority lifecycle", { timeout: 30_000 }, () => {
    it("does not revive an intent after a query B-to-A-to-B transition", async () => {
        const doc = new Y.Doc({ guid: "grid-write-query-aba" });
        createTestTable(doc, "a", "CREATE TABLE a (id TEXT PRIMARY KEY, value TEXT)", "same", { value: "A" });
        const b = createTestTable(doc, "b", "CREATE TABLE b (id TEXT PRIMARY KEY, value TEXT, peer TEXT)", "same", {
            value: "B",
            peer: "keep",
        });
        const h = await createMutationHarness(doc, "SELECT id, value, peer FROM b");
        try {
            const stale = h.boundary.captureUpdate(0, "value", "stale");
            h.session.setQuery("SELECT id, value FROM a");
            h.session.setQuery("SELECT id, value, peer FROM b");
            await expect(h.boundary.commit(stale)).rejects.toThrow(/authority changed/);
            expect(b.handles.data.get("same")?.toJSON()).toEqual({ id: "same", value: "B", peer: "keep" });
            expect(b.handles.undo.undoStack).toHaveLength(0);

            await h.refresh();
            await h.boundary.commit(h.boundary.captureUpdate(0, "value", "fresh"));
            expect(b.handles.data.get("same")?.toJSON()).toEqual({ id: "same", value: "fresh", peer: "keep" });
        } finally {
            h.dispose();
        }
    });

    it("refuses a captured intent after schema replacement and permits fresh proof", async () => {
        const doc = new Y.Doc({ guid: "grid-write-schema-replacement" });
        const b = createTestTable(doc, "b", "CREATE TABLE b (id TEXT PRIMARY KEY, value TEXT, peer TEXT)", "b1", {
            value: "before",
            peer: "keep",
        });
        const h = await createMutationHarness(doc, "SELECT id, value, peer FROM b");
        try {
            const stale = h.boundary.captureUpdate(0, "value", "stale");
            setSchemaText(b.handles, "CREATE TABLE b (id TEXT PRIMARY KEY, value TEXT, peer TEXT, extra TEXT)");
            const historyAfterReplacement = b.handles.undo.undoStack.length;
            await expect(h.boundary.commit(stale)).rejects.toThrow(/authority changed/);
            expect(b.handles.data.get("b1")?.toJSON()).toEqual({ id: "b1", value: "before", peer: "keep" });
            expect(b.handles.undo.undoStack).toHaveLength(historyAfterReplacement);

            await h.refresh();
            await h.boundary.commit(h.boundary.captureUpdate(0, "value", "fresh"));
            expect(b.handles.data.get("b1")?.toJSON()).toEqual({ id: "b1", value: "fresh", peer: "keep" });
        } finally {
            h.dispose();
        }
    });

    it("refuses same-name source recreation and writes only after fresh execution", async () => {
        const doc = new Y.Doc({ guid: "grid-write-source-recreation" });
        const old = createTestTable(doc, "b", "CREATE TABLE b (id TEXT PRIMARY KEY, value TEXT, peer TEXT)", "b1", {
            value: "old",
            peer: "old-peer",
        });
        const h = await createMutationHarness(doc, "SELECT id, value, peer FROM b");
        try {
            const stale = h.boundary.captureUpdate(0, "value", "stale");
            removeTable(doc, old.tableId);
            const replacement = createTestTable(
                doc,
                "b",
                "CREATE TABLE b (id TEXT PRIMARY KEY, value TEXT, peer TEXT)",
                "b1",
                { value: "new", peer: "keep" },
            );
            await expect(h.boundary.commit(stale)).rejects.toThrow(/authority changed|physical identity/);
            expect(replacement.handles.data.get("b1")?.toJSON()).toEqual({ id: "b1", value: "new", peer: "keep" });
            expect(replacement.handles.undo.undoStack).toHaveLength(0);

            await h.refresh();
            await h.boundary.commit(h.boundary.captureUpdate(0, "value", "fresh"));
            expect(replacement.handles.data.get("b1")?.toJSON()).toEqual({ id: "b1", value: "fresh", peer: "keep" });
        } finally {
            h.dispose();
        }
    });
});
