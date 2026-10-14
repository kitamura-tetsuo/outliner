import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { resetPgliteForTests } from "./pgliteService";
import { analyzeProjectQueryProvenance } from "./projectQueryProvenance";
import { createProjectSelectSession } from "./projectSelectSession";
import { addRecord, createTable, getTableHandles, setSchemaText } from "./tableDocs";
import { resetTableEngineForTests, type TableDocConnector } from "./tableEngine";

const connect: TableDocConnector = async () => ({
    waitForInitialSync: async () => ({ synced: true }),
    dispose: () => {},
});

function project(): Y.Doc {
    const doc = new Y.Doc({ guid: `provenance-authority-${crypto.randomUUID()}` });
    const tableId = createTable(doc, "A", "a");
    const handles = getTableHandles(doc, tableId)!;
    setSchemaText(handles, "CREATE TABLE a (id TEXT PRIMARY KEY, value INTEGER)");
    addRecord(handles, { value: 1 }, "a1");
    return doc;
}

async function analyze(doc: Y.Doc, query: string) {
    const session = createProjectSelectSession({ projectDoc: doc, query, connect, requireExplicitAliases: false });
    try {
        const evidence = await session.runNow();
        expect(evidence).toBeDefined();
        return analyzeProjectQueryProvenance(evidence!);
    } finally {
        session.dispose();
    }
}

afterEach(async () => await resetTableEngineForTests());
afterAll(async () => await resetPgliteForTests());

describe("Project query mutation authority", { timeout: 30_000 }, () => {
    it("refuses supplier and write authority for a readable CTE", async () => {
        const result = await analyze(project(), "WITH extra AS (SELECT 1) SELECT id, value FROM a");

        expect(result.status).toBe("unsupported");
        expect(result.suppliers).toEqual([]);
        expect(result.branches).toEqual([]);
        expect(result.bareIdSource).toBeUndefined();
    });

    it("does not map a synthetic id to the physical identity", async () => {
        const result = await analyze(project(), "SELECT 'lit' AS id, value FROM a");

        expect(result.status).toBe("proven");
        expect(result.bareIdSource).toBeUndefined();
        expect(result.branches[0]?.columns.map(column => [column.outputColumn, column.physicalColumn])).toEqual([
            ["value", "value"],
        ]);
    });

    it("withholds every authority signal for duplicate source_id outputs", async () => {
        const query = "SELECT 'a' AS source_kind, id AS source_id, id AS source_id FROM a";
        const result = await analyze(project(), query);

        expect(result.bareIdSource).toBeUndefined();
        expect(result.branches).toHaveLength(1);
        expect(result.branches[0]).toMatchObject({ columns: [], routedIdentity: false });
    });

    it("withholds every branch authority signal for duplicate UNION outputs", async () => {
        const query = "SELECT 'a' AS source_kind, id AS source_id, id AS source_id FROM a "
            + "UNION ALL SELECT 'a', id, id FROM a";
        const result = await analyze(project(), query);

        expect(result.bareIdSource).toBeUndefined();
        expect(result.branches).toHaveLength(2);
        expect(result.branches.map(branch => ({ columns: branch.columns, routedIdentity: branch.routedIdentity })))
            .toEqual([
                { columns: [], routedIdentity: false },
                { columns: [], routedIdentity: false },
            ]);
    });
});
