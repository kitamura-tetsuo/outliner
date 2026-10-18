import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createMutationHarness, createTestTable } from "./gridExistingRowMutation.testSupport";
import { resetPgliteForTests } from "./pgliteService";
import { removeTable, setSchemaText } from "./tableDocs";
import { resetTableEngineForTests } from "./tableEngine";

afterEach(async () => await resetTableEngineForTests());
afterAll(async () => await resetPgliteForTests());

describe("Grid mutation in-flight authority revalidation", { timeout: 30_000 }, () => {
    it("refuses query A-to-B-to-A while provider resolution is suspended", async () => {
        const doc = new Y.Doc({ guid: "grid-write-inflight-query" });
        const a = createTestTable(doc, "a", "CREATE TABLE a (id TEXT PRIMARY KEY, value TEXT)", "same", {
            value: "A",
        });
        createTestTable(doc, "b", "CREATE TABLE b (id TEXT PRIMARY KEY, value TEXT)", "same", { value: "B" });
        const h = await createMutationHarness(doc, "SELECT id, value FROM a", { gatedResolution: true });
        try {
            const commit = h.boundary.commit(h.boundary.captureUpdate(0, "value", "wrong"));
            await h.resolutionPending;
            h.session.setQuery("SELECT id, value FROM b");
            h.session.setQuery("SELECT id, value FROM a");
            h.releaseResolution();
            await expect(commit).rejects.toThrow(/authority changed/);
            expect(a.handles.data.get("same")?.get("value")).toBe("A");
            expect(a.handles.undo.undoStack).toHaveLength(0);
        } finally {
            h.dispose();
        }
    });

    it("refuses schema replacement while provider resolution is suspended", async () => {
        const doc = new Y.Doc({ guid: "grid-write-inflight-schema" });
        const b = createTestTable(doc, "b", "CREATE TABLE b (id TEXT PRIMARY KEY, value TEXT)", "b1", {
            value: "before",
        });
        const h = await createMutationHarness(doc, "SELECT id, value FROM b", { gatedResolution: true });
        try {
            const commit = h.boundary.commit(h.boundary.captureUpdate(0, "value", "wrong"));
            await h.resolutionPending;
            setSchemaText(b.handles, "CREATE TABLE b (id TEXT PRIMARY KEY, value TEXT, peer TEXT)");
            const historyAfterSchema = b.handles.undo.undoStack.length;
            h.releaseResolution();
            await expect(commit).rejects.toThrow(/authority changed|physical identity/);
            expect(b.handles.data.get("b1")?.get("value")).toBe("before");
            expect(b.handles.undo.undoStack).toHaveLength(historyAfterSchema);
        } finally {
            h.dispose();
        }
    });

    it("refuses same-name source recreation while provider resolution is suspended", async () => {
        const doc = new Y.Doc({ guid: "grid-write-inflight-source" });
        const old = createTestTable(doc, "b", "CREATE TABLE b (id TEXT PRIMARY KEY, value TEXT)", "same", {
            value: "old",
        });
        const h = await createMutationHarness(doc, "SELECT id, value FROM b", { gatedResolution: true });
        try {
            const commit = h.boundary.commit(h.boundary.captureUpdate(0, "value", "wrong"));
            await h.resolutionPending;
            removeTable(doc, old.tableId);
            const replacement = createTestTable(doc, "b", "CREATE TABLE b (id TEXT PRIMARY KEY, value TEXT)", "same", {
                value: "new",
            });
            h.releaseResolution();
            await expect(commit).rejects.toThrow(/authority changed|physical identity/);
            expect(replacement.handles.data.get("same")?.get("value")).toBe("new");
            expect(replacement.handles.undo.undoStack).toHaveLength(0);
        } finally {
            h.dispose();
        }
    });

    it("refuses permission revocation while provider resolution is suspended", async () => {
        const doc = new Y.Doc({ guid: "grid-write-inflight-permission" });
        const b = createTestTable(doc, "b", "CREATE TABLE b (id TEXT PRIMARY KEY, value TEXT)", "b1", {
            value: "before",
        });
        const h = await createMutationHarness(doc, "SELECT id, value FROM b", { gatedResolution: true });
        try {
            const commit = h.boundary.commit(h.boundary.captureUpdate(0, "value", "wrong"));
            await h.resolutionPending;
            h.setAllowed(false);
            h.releaseResolution();
            await expect(commit).rejects.toThrow(/no longer allows/);
            expect(b.handles.data.get("b1")?.get("value")).toBe("before");
            expect(b.handles.undo.undoStack).toHaveLength(0);
        } finally {
            h.dispose();
        }
    });
});
