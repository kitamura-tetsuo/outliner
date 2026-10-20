import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { analyzeProjectQueryProvenance } from "../../../../shared/src/services/projectQueryProvenance";
import { createGrid, getGridHandles, setGridInsertTargetTableId } from "./gridDocs";
import { createGridInsertController, type GridInsertController } from "./gridInsertController";
import { resetPgliteForTests, runSelect } from "./pgliteService";
import { createProjectSelectSession, type ProjectSelectSession } from "./projectSelectSession";
import { projectSchemaName, quoteIdent } from "./sqlNames";
import { addRecord, createTable, getTableHandles, setSchemaText } from "./tableDocs";
import { createTableEngineSession, resetTableEngineForTests, type TableDocConnector } from "./tableEngine";
import { executeGridQuery } from "./tableSyncAdapter";

// Only the transport boundary is local: schemas, SQL, evidence and writes are real.
const connect: TableDocConnector = async () => ({ waitForInitialSync: async () => ({ synced: true }), dispose() {} });
afterEach(resetTableEngineForTests);
afterAll(resetPgliteForTests);

function published<T>(subscribe: (listener: (state: T) => void) => () => void, ready: (state: T) => boolean) {
    return new Promise<T>((resolve, reject) => {
        let stop = () => {};
        let settled = false;
        const timeout = setTimeout(() => {
            stop();
            reject(new Error("No successful current publication before deadline"));
        }, 20000);
        stop = subscribe(state => {
            if (!ready(state)) return;
            settled = true;
            clearTimeout(timeout);
            stop();
            resolve(state);
        });
        if (settled) stop();
    });
}

async function successful(session: ProjectSelectSession) {
    const state = await published(session.subscribe.bind(session), state => state.status === "success");
    if (state.status !== "success") throw new Error("Expected completed SELECT");
    expect(session.isEvidenceCurrent(state.evidence)).toBe(true);
    return state.evidence;
}

async function initialized(controller: GridInsertController) {
    await published(controller.subscribe.bind(controller), state => !state.loading && !!state.resolution);
}

describe("native catalog collision source authority", { timeout: 60000 }, () => {
    it("reads the catalog but refuses INSERT and preference without any Table or Grid effects", async () => {
        const doc = new Y.Doc({ guid: "native-catalog-collision" });
        const projectId = doc.guid;
        const id = createTable(doc, "Collision", "pg_class");
        const table = getTableHandles(doc, id)!;
        const engine = createTableEngineSession({ projectDoc: doc, projectId, connect });
        const acquired = (await engine.acquire(id))!;
        const sql = "CREATE TABLE pg_class (id TEXT PRIMARY KEY, oid BIGINT)";
        const prepared = await acquired.adapter.prepareSchemaChange(sql);
        await acquired.adapter.applySchema(prepared.parsed);
        expect(table.schemaText.toString()).toBe(sql);
        const query = "SELECT oid AS oid FROM pg_class LIMIT 1";
        const grid = getGridHandles(doc, createGrid(doc, undefined, { query }))!;
        const session = createProjectSelectSession({ projectDoc: doc, projectId, query, connect });
        const controller = createGridInsertController({
            projectDoc: doc,
            projectId,
            gridEntry: grid.entry,
            query,
            connect,
            onPreferenceChange: value => setGridInsertTargetTableId(grid, value),
        });
        const physical = () => runSelect(`SELECT * FROM ${quoteIdent(projectSchemaName(projectId))}.pg_class`);
        try {
            const evidence = await successful(session);
            await initialized(controller);
            expect(evidence.rows).toHaveLength(1);
            expect(evidence.rows[0]).toHaveProperty("oid");
            expect((await physical()).rows).toEqual([]);
            const before = {
                table: table.doc.toJSON(),
                grid: grid.entry.toJSON(),
                tableHistory: [table.undo.undoStack.length, table.undo.redoStack.length],
                gridHistory: [grid.undo.undoStack.length, grid.undo.redoStack.length],
            };
            expect(evidence.dependencyStatus).toBe("unknown");
            expect(evidence.sources).toEqual([]);
            const proof = analyzeProjectQueryProvenance(evidence);
            expect(proof.dependencies).toEqual({ status: "unknown", relations: [] });
            expect(proof.suppliers).toEqual([]);
            expect(proof.branches).toEqual([]);
            expect(proof.bareIdSource).toBeUndefined();
            expect(controller.state.candidates).toEqual([]);
            expect(controller.state.resolution?.target).toBeUndefined();
            expect(await controller.submit()).toMatchObject({ status: "refused", mode: "unavailable" });
            expect(await controller.savePreference(id)).toBeDefined();
            expect({
                table: table.doc.toJSON(),
                grid: grid.entry.toJSON(),
                tableHistory: [table.undo.undoStack.length, table.undo.redoStack.length],
                gridHistory: [grid.undo.undoStack.length, grid.undo.redoStack.length],
            }).toEqual(before);
            expect(grid.entry.has("insertTargetTableId")).toBe(false);
            expect((await physical()).rows).toEqual([]);
        } finally {
            await controller.dispose();
            await session.dispose();
            engine.dispose();
        }
    });

    it("retains only genuinely bound partial dependencies beside a shadowed provider", async () => {
        const doc = new Y.Doc({ guid: "partial-catalog-collision" });
        for (const name of ["a", "pg_class"]) {
            const table = getTableHandles(doc, createTable(doc, name, name))!;
            setSchemaText(table, `CREATE TABLE ${name} (id TEXT PRIMARY KEY)`);
            if (name === "a") addRecord(table, {}, "actual-a");
        }
        const session = createProjectSelectSession({
            projectDoc: doc,
            projectId: doc.guid,
            connect,
            query: "SELECT id AS id FROM a WHERE EXISTS (SELECT 1 FROM pg_class)",
        });
        try {
            const evidence = await successful(session);
            expect(evidence.rows).toEqual([{ id: "actual-a" }]);
            expect(evidence.dependencyStatus).toBe("unknown");
            expect(evidence.sources.map(source => source.sqlName)).toEqual(["a"]);
            const proof = analyzeProjectQueryProvenance(evidence);
            expect(proof.dependencies.relations.map(source => source.sqlName)).toEqual(["a"]);
            expect(proof.suppliers).toEqual([]);
            expect(proof.branches).toEqual([]);
            expect(proof.bareIdSource).toBeUndefined();
        } finally {
            await session.dispose();
        }
    });
    it("recaptures discovered bindings before SELECT can change its transaction search path", async () => {
        const doc = new Y.Doc({ guid: "native-binding-order" });
        const table = getTableHandles(doc, createTable(doc, "Actual", "actual"))!;
        setSchemaText(table, "CREATE TABLE actual (id TEXT PRIMARY KEY)");
        addRecord(table, {}, "actual-row");
        const engine = createTableEngineSession({ projectDoc: doc, projectId: doc.guid, connect });
        try {
            await engine.catalogReady();
            // The first attempt has no materialized actual relation. The real
            // missing-relation resolver must add it and recapture on retry.
            const result = await executeGridQuery(
                "SELECT id AS id, set_config('search_path', 'pg_catalog', true) AS path FROM actual",
                { pgSchema: projectSchemaName(doc.guid), relationNames: [], registry: engine },
            );
            expect(result.rows).toEqual([{ id: "actual-row", path: "pg_catalog" }]);
            expect(result.relationBindings).toEqual([{
                sqlName: "actual",
                schemaName: projectSchemaName(doc.guid),
                relationOid: expect.any(Number),
                visible: true,
            }]);
            const constant = await executeGridQuery("SELECT 1 AS answer", {
                pgSchema: projectSchemaName(doc.guid),
                relationNames: [],
            });
            expect(constant.rows).toEqual([{ answer: 1 }]);
            expect(constant.relationBindings).toEqual([]);
            const unrequested = await executeGridQuery("SELECT 1 AS answer", { pgSchema: projectSchemaName(doc.guid) });
            expect(unrequested.relationBindings).toBeUndefined();
        } finally {
            engine.dispose();
        }
    });
});
