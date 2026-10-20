import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { analyzeProjectQueryProvenance } from "../../../../shared/src/services/projectQueryProvenance";
import { createGridExistingRowMutationBoundary } from "./gridExistingRowMutation";
import { createGridMetadataResolver } from "./gridMetadataResolver";
import { resetPgliteForTests } from "./pgliteService";
import { createProjectSelectSession } from "./projectSelectSession";
import { addRecord, createTable, getTableHandles, setSchemaText, type TableRecordValue } from "./tableDocs";
import { resetTableEngineForTests, type TableDocConnector } from "./tableEngine";

const connect: TableDocConnector = async () => ({
    waitForInitialSync: async () => ({ synced: true }),
    dispose: () => {},
});

function table(
    doc: Y.Doc,
    sqlName: string,
    schema: string,
    id: string,
    values: Record<string, TableRecordValue>,
) {
    const tableId = createTable(doc, sqlName.toUpperCase(), sqlName);
    const handles = getTableHandles(doc, tableId)!;
    setSchemaText(handles, schema);
    addRecord(handles, values, id);
    return { tableId, handles };
}

async function fixture(doc: Y.Doc, query: string) {
    const session = createProjectSelectSession({ projectDoc: doc, query, connect, requireExplicitAliases: false });
    let evidence = await session.runNow();
    if (!evidence) {
        await new Promise(resolve => setTimeout(resolve, 20));
        evidence = await session.runNow();
    }
    if (!evidence) throw new Error("The Project SELECT did not produce current evidence");
    const provenance = analyzeProjectQueryProvenance(evidence);
    const resolver = createGridMetadataResolver({ projectDoc: doc, connect });
    const metadata = await resolver.resolve(evidence, provenance, session);
    let canWrite = true;
    const boundary = createGridExistingRowMutationBoundary({
        projectDoc: doc,
        connect,
        session,
        evidence: () => evidence,
        provenance: () => provenance,
        metadata: () => metadata,
        canWrite: () => canWrite,
        allows: () => true,
    });
    return { session, resolver, evidence, provenance, metadata, boundary, revoke: () => canWrite = false };
}

afterEach(async () => await resetTableEngineForTests());
afterAll(async () => await resetPgliteForTests());

describe("Grid existing-row mutation boundary", { timeout: 30_000 }, () => {
    it("updates and deletes only the proven B row and retains Table Undo/Redo", async () => {
        const doc = new Y.Doc({ guid: "grid-write-b" });
        const a = table(doc, "a", "CREATE TABLE a (id TEXT PRIMARY KEY, status TEXT)", "same", { status: "A" });
        const b = table(doc, "b", "CREATE TABLE b (id TEXT PRIMARY KEY, status TEXT)", "same", { status: "B" });
        const f = await fixture(doc, "SELECT id, status FROM b");
        try {
            b.handles.undo.clear();
            const update = f.boundary.captureUpdate(0, "status", "B2");
            await expect(f.boundary.commit(update)).resolves.toMatchObject({
                source: { id: b.tableId, sqlName: "b" },
                rowId: "same",
                physicalColumn: "status",
            });
            expect(b.handles.data.get("same")?.get("status")).toBe("B2");
            expect(a.handles.data.get("same")?.get("status")).toBe("A");
            b.handles.undo.undo();
            expect(b.handles.data.get("same")?.get("status")).toBe("B");
            b.handles.undo.redo();
            expect(b.handles.data.get("same")?.get("status")).toBe("B2");

            // A fresh execution is required because the accepted data change
            // invalidates the captured SELECT authority.
            f.boundary.dispose();
            f.resolver.dispose();
            f.session.dispose();
            const deletion = await fixture(doc, "SELECT id, status FROM b");
            try {
                b.handles.undo.clear();
                await deletion.boundary.commit(deletion.boundary.captureDelete(0));
                expect(b.handles.data.has("same")).toBe(false);
                expect(a.handles.data.has("same")).toBe(true);
                b.handles.undo.undo();
                expect(b.handles.data.has("same")).toBe(true);
            } finally {
                deletion.boundary.dispose();
                deletion.resolver.dispose();
                deletion.session.dispose();
            }
        } finally {
            f.boundary.dispose();
            f.resolver.dispose();
            f.session.dispose();
        }
    });

    it("uses positional UNION provenance and refuses forged and transformed targets", async () => {
        const doc = new Y.Doc({ guid: "grid-write-union" });
        const a = table(doc, "a", "CREATE TABLE a (id TEXT PRIMARY KEY, title TEXT)", "same", { title: "A" });
        const b = table(doc, "b", "CREATE TABLE b (id TEXT PRIMARY KEY, label TEXT)", "same", { label: "B" });
        const query = "SELECT 'a' AS source_kind, id AS source_id, title AS shown, title || '!' AS computed FROM a "
            + "UNION ALL SELECT 'b', id, label, label || '!' FROM b ORDER BY shown";
        const f = await fixture(doc, query);
        try {
            const bIndex = f.evidence.rows.findIndex(row => row.source_kind === "b");
            expect(() => f.boundary.captureUpdate(0, "computed", "forged")).toThrow(/no unique current physical field/);
            await f.boundary.commit(f.boundary.captureUpdate(bIndex, "shown", "B2"));
            expect(b.handles.data.get("same")?.get("label")).toBe("B2");
            expect(a.handles.data.get("same")?.get("title")).toBe("A");

            f.evidence.rows[0]!.source_kind = "b";
            expect(() => f.boundary.captureUpdate(0, "shown", "forged")).toThrow(/stale/);
            expect(b.handles.data.get("same")?.get("label")).toBe("B2");
        } finally {
            f.boundary.dispose();
            f.resolver.dispose();
            f.session.dispose();
        }
    });

    it("fails closed when authority changes before commit", async () => {
        const doc = new Y.Doc({ guid: "grid-write-stale" });
        const b = table(doc, "b", "CREATE TABLE b (id TEXT PRIMARY KEY, status TEXT NOT NULL)", "b1", {
            status: "before",
        });
        const f = await fixture(doc, "SELECT id, status FROM b");
        try {
            b.handles.undo.clear();
            const pending = f.boundary.captureUpdate(0, "status", "after");
            f.revoke();
            await expect(f.boundary.commit(pending)).rejects.toThrow(/revoked/);
            expect(b.handles.data.get("b1")?.get("status")).toBe("before");
            expect(b.handles.undo.undoStack).toHaveLength(0);
        } finally {
            f.boundary.dispose();
            f.resolver.dispose();
            f.session.dispose();
        }
    });
});
