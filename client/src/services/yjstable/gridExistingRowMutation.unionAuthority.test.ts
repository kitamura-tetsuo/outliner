import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createMutationHarness, createTestTable } from "./gridExistingRowMutation.testSupport";
import { resetPgliteForTests } from "./pgliteService";
import { resetTableEngineForTests } from "./tableEngine";

afterEach(async () => await resetTableEngineForTests());
afterAll(async () => await resetPgliteForTests());

describe("Grid UNION mutation authority", { timeout: 30_000 }, () => {
    it("refuses an unverified source_kind before any write and still accepts a verified branch", async () => {
        const doc = new Y.Doc({ guid: "grid-write-forged-union" });
        const a = createTestTable(doc, "a", "CREATE TABLE a (id TEXT PRIMARY KEY, title TEXT)", "same", {
            title: "A",
        });
        const b = createTestTable(doc, "b", "CREATE TABLE b (id TEXT PRIMARY KEY, label TEXT)", "same", {
            label: "B",
        });
        const query = "SELECT 'a' AS source_kind, id AS source_id, title AS shown FROM a "
            + "UNION ALL SELECT 'b', id, label FROM b ORDER BY shown";
        const h = await createMutationHarness(doc, query);
        try {
            const aIndex = h.evidence().rows.findIndex(candidate => candidate.source_kind === "a");
            const row = h.evidence().rows[aIndex]!;
            row.source_kind = "not_a_supplier";
            expect(() => h.boundary.captureUpdate(aIndex, "shown", "wrong")).toThrow(/completed execution/);
            expect(a.handles.data.get("same")?.get("title")).toBe("A");
            expect(b.handles.data.get("same")?.get("label")).toBe("B");
            expect(a.handles.undo.undoStack).toHaveLength(0);
            expect(b.handles.undo.undoStack).toHaveLength(0);

            row.source_kind = "a";
            const bIndex = h.evidence().rows.findIndex(candidate => candidate.source_kind === "b");
            await h.boundary.commit(h.boundary.captureUpdate(bIndex, "shown", "B2"));
            expect(a.handles.data.get("same")?.get("title")).toBe("A");
            expect(b.handles.data.get("same")?.get("label")).toBe("B2");
        } finally {
            h.dispose();
        }
    });

    it("refuses bare-id UNION rows without guessing a supplier", async () => {
        const doc = new Y.Doc({ guid: "grid-write-bare-union" });
        const a = createTestTable(doc, "a", "CREATE TABLE a (id TEXT PRIMARY KEY, title TEXT)", "same", {
            title: "A",
        });
        const b = createTestTable(doc, "b", "CREATE TABLE b (id TEXT PRIMARY KEY, title TEXT)", "same", {
            title: "B",
        });
        const h = await createMutationHarness(doc, "SELECT id, title FROM a UNION ALL SELECT id, title FROM b");
        try {
            expect(() => h.boundary.captureUpdate(0, "title", "wrong")).toThrow(/source_kind identity/);
            expect(a.handles.data.get("same")?.get("title")).toBe("A");
            expect(b.handles.data.get("same")?.get("title")).toBe("B");
            expect(a.handles.undo.undoStack).toHaveLength(0);
            expect(b.handles.undo.undoStack).toHaveLength(0);
        } finally {
            h.dispose();
        }
    });

    it("validates a UNION value against the selected branch's physical schema", async () => {
        const doc = new Y.Doc({ guid: "grid-write-incompatible-union" });
        const a = createTestTable(
            doc,
            "a",
            "CREATE TABLE a (id TEXT PRIMARY KEY, status TEXT CHECK (status IN ('A-only')))",
            "a1",
            { status: "A-only" },
        );
        const b = createTestTable(
            doc,
            "b",
            "CREATE TABLE b (id TEXT PRIMARY KEY, state TEXT CHECK (state IN ('B-only', 'B-next')))",
            "b1",
            { state: "B-only" },
        );
        const query = "SELECT 'a' AS source_kind, id AS source_id, status AS shown FROM a "
            + "UNION ALL SELECT 'b', id, state FROM b";
        const h = await createMutationHarness(doc, query);
        try {
            const bIndex = h.evidence().rows.findIndex(row => row.source_kind === "b");
            expect(() => h.boundary.captureUpdate(bIndex, "shown", "A-only")).toThrow(/not allowed/);
            expect(a.handles.data.get("a1")?.get("status")).toBe("A-only");
            expect(b.handles.data.get("b1")?.get("state")).toBe("B-only");
            expect(b.handles.undo.undoStack).toHaveLength(0);

            await h.boundary.commit(h.boundary.captureUpdate(bIndex, "shown", "B-next"));
            expect(a.handles.data.get("a1")?.get("status")).toBe("A-only");
            expect(b.handles.data.get("b1")?.get("state")).toBe("B-next");
        } finally {
            h.dispose();
        }
    });
});
