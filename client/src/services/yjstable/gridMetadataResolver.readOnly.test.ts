import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createGrid, destroyGridUndoManager, getGridHandles, getGridRegistry } from "./gridDocs";
import { createGridMetadataResolver } from "./gridMetadataResolver";
import { resetPgliteForTests } from "./pgliteService";
import { analyzeProjectQueryProvenance } from "./projectQueryProvenance";
import { createProjectSelectSession } from "./projectSelectSession";
import { addRecord, createTable, getTableHandles, getTableRegistry, setSchemaText } from "./tableDocs";
import { resetTableEngineForTests, type TableDocConnector } from "./tableEngine";

const connect: TableDocConnector = async () => ({
    waitForInitialSync: async () => ({ synced: true }),
    dispose: () => {},
});

afterEach(async () => await resetTableEngineForTests());
afterAll(async () => await resetPgliteForTests());

function seededTable(doc: Y.Doc) {
    const tableId = createTable(doc, "A", "a");
    const handles = getTableHandles(doc, tableId)!;
    setSchemaText(handles, "CREATE TABLE a (id TEXT PRIMARY KEY, value TEXT)");
    addRecord(handles, { value: "present" }, "a1");
    return { tableId, handles };
}

describe("Grid metadata production-boundary invariants", { timeout: 30_000 }, () => {
    it("preserves a table-backed successful zero-row result and its physical mapping", async () => {
        const doc = new Y.Doc({ guid: "grid-metadata-table-empty" });
        const { tableId } = seededTable(doc);
        const select = createProjectSelectSession({
            projectDoc: doc,
            query: "SELECT value FROM a WHERE false",
            connect,
            requireExplicitAliases: false,
        });
        const resolver = createGridMetadataResolver({ projectDoc: doc, connect });
        try {
            const evidence = (await select.runNow())!;
            const result = await resolver.resolve(evidence, analyzeProjectQueryProvenance(evidence), select);

            expect(result.status).toBe("resolved");
            expect(result.columns).toEqual([{ index: 0, name: "value", typeId: 25 }]);
            expect(result.rows).toEqual([]);
            expect(result.physicalColumns).toMatchObject([
                { outputIndex: 0, outputColumn: "value", physicalColumn: "value", source: { id: tableId } },
            ]);
        } finally {
            resolver.dispose();
            select.dispose();
        }
    });

    it("does not mutate Project, Table, Grid, query, or undo history while resolving twice", async () => {
        const doc = new Y.Doc({ guid: "grid-metadata-read-only" });
        const { tableId, handles } = seededTable(doc);
        const gridId = createGrid(doc, tableId, { name: "Read only", query: "SELECT value FROM a" });
        const grid = getGridHandles(doc, gridId)!;
        const select = createProjectSelectSession({
            projectDoc: doc,
            query: "SELECT value FROM a",
            connect,
            requireExplicitAliases: false,
        });
        const resolver = createGridMetadataResolver({ projectDoc: doc, connect });
        try {
            const evidence = (await select.runNow())!;
            const proof = analyzeProjectQueryProvenance(evidence);
            const before = {
                projectState: [...Y.encodeStateVector(doc)],
                tableState: [...Y.encodeStateVector(handles.doc)],
                registry: getTableRegistry(doc).toJSON(),
                records: handles.data.toJSON(),
                schema: handles.schemaText.toString(),
                grids: getGridRegistry(doc).toJSON(),
                tableUndo: handles.undo.undoStack.length,
                gridUndo: grid.undo.undoStack.length,
            };

            expect((await resolver.resolve(evidence, proof, select)).status).toBe("resolved");
            expect((await resolver.resolve(evidence, proof, select)).status).toBe("resolved");
            resolver.dispose();

            expect({
                projectState: [...Y.encodeStateVector(doc)],
                tableState: [...Y.encodeStateVector(handles.doc)],
                registry: getTableRegistry(doc).toJSON(),
                records: handles.data.toJSON(),
                schema: handles.schemaText.toString(),
                grids: getGridRegistry(doc).toJSON(),
                tableUndo: handles.undo.undoStack.length,
                gridUndo: grid.undo.undoStack.length,
            }).toEqual(before);
        } finally {
            resolver.dispose();
            select.dispose();
            destroyGridUndoManager(grid.entry);
        }
    });
});
