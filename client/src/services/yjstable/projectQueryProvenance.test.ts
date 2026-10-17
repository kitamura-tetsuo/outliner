import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { resetPgliteForTests } from "./pgliteService";
import { analyzeProjectQueryProvenance, isProjectQueryProvenanceCurrent } from "./projectQueryProvenance";
import { createProjectSelectSession } from "./projectSelectSession";
import {
    addRecord,
    createTable,
    getTableHandles,
    removeTable,
    setSchemaText,
    type TableRecordValue,
} from "./tableDocs";
import { resetTableEngineForTests, type TableDocConnector } from "./tableEngine";

const connect: TableDocConnector = async () => ({
    waitForInitialSync: async () => ({ synced: true }),
    dispose: () => {},
});

function table(
    doc: Y.Doc,
    title: string,
    sqlName: string,
    schema: string,
    id: string,
    values: Record<string, TableRecordValue>,
) {
    const tableId = createTable(doc, title, sqlName);
    const handles = getTableHandles(doc, tableId)!;
    setSchemaText(handles, schema);
    addRecord(handles, values, id);
    return { tableId, handles };
}

async function analyze(doc: Y.Doc, query: string) {
    const session = createProjectSelectSession({ projectDoc: doc, query, connect, requireExplicitAliases: false });
    try {
        const evidence = await session.runNow();
        expect(evidence).toBeDefined();
        return { evidence: evidence!, result: analyzeProjectQueryProvenance(evidence!) };
    } finally {
        session.dispose();
    }
}

afterEach(async () => await resetTableEngineForTests());
afterAll(async () => await resetPgliteForTests());

describe("Project query provenance", { timeout: 30_000 }, () => {
    it("separates executed dependencies from suppliers and ignores row counts", async () => {
        const doc = new Y.Doc({ guid: "provenance-dependencies" });
        table(doc, "A", "a", "CREATE TABLE a (id TEXT PRIMARY KEY, value INTEGER)", "same", { value: 1 });
        table(doc, "B", "b", "CREATE TABLE b (id TEXT PRIMARY KEY, value INTEGER)", "same", { value: 2 });
        const exists = (await analyze(doc, "SELECT a.* FROM a WHERE EXISTS (SELECT 1 FROM b) AND false")).result;
        expect(exists.dependencies.relations.map(source => source.sqlName)).toEqual(["a", "b"]);
        expect(exists.suppliers.map(source => source.sqlName)).toEqual(["a"]);
        expect(exists.bareIdSource?.sqlName).toBe("a");

        const union =
            (await analyze(doc, "SELECT id, value FROM a WHERE false UNION ALL SELECT id, value FROM b LIMIT 0"))
                .result;
        expect(union.suppliers.map(source => source.sqlName)).toEqual(["a", "b"]);
        expect(union.bareIdSource).toBeUndefined();
    });

    it("uses the real supplier identity and exact qualified physical fields", async () => {
        const doc = new Y.Doc({ guid: "provenance-single" });
        const a = table(doc, "Legacy primary", "a", "CREATE TABLE a (id TEXT PRIMARY KEY, title TEXT)", "same", {
            title: "A",
        });
        const b = table(doc, "Actual", "b", "CREATE TABLE b (id TEXT PRIMARY KEY, title TEXT)", "same", { title: "B" });
        const { result } = await analyze(
            doc,
            "SELECT actual.id, actual.title AS shown FROM b AS actual ORDER BY shown LIMIT 1",
        );
        expect(result.bareIdSource).toMatchObject({ id: b.tableId, sqlName: "b" });
        expect(result.bareIdSource?.id).not.toBe(a.tableId);
        expect(result.branches[0]?.columns.map(column => [column.outputColumn, column.physicalColumn])).toEqual([
            ["id", "id"],
            ["shown", "title"],
        ]);
    });

    it("verifies routed UNION identity and resolves branch columns positionally", async () => {
        const doc = new Y.Doc({ guid: "provenance-union" });
        table(doc, "A", "a", "CREATE TABLE a (id TEXT PRIMARY KEY, title TEXT, points INTEGER)", "a1", {
            title: "A",
            points: 1,
        });
        table(doc, "B", "b", "CREATE TABLE b (id TEXT PRIMARY KEY, label TEXT, score INTEGER)", "b1", {
            label: "B",
            score: 2,
        });
        const query = "SELECT 'b' AS source_kind, id AS source_id, title AS shown, points + 1 AS calculated FROM a "
            + "UNION ALL SELECT 'b', id, label, score FROM b";
        const { result } = await analyze(doc, query);
        expect(result.branches.map(branch => ({
            claimedSourceKind: branch.claimedSourceKind,
            routedIdentity: branch.routedIdentity,
        }))).toEqual([
            { claimedSourceKind: "b", routedIdentity: false },
            { claimedSourceKind: "b", routedIdentity: true },
        ]);
        expect(result.branches[0]?.columns.map(column => [column.outputColumn, column.physicalColumn])).toEqual([
            ["source_id", "id"],
            ["shown", "title"],
        ]);
        expect(result.branches[1]?.columns.map(column => [column.outputColumn, column.physicalColumn])).toEqual([
            ["source_id", "id"],
            ["shown", "label"],
            ["calculated", "score"],
        ]);
    });

    it("reports unsupported forms and invalidates replaced-source evidence", async () => {
        const doc = new Y.Doc({ guid: "provenance-currentness" });
        const old = table(doc, "A", "a", "CREATE TABLE a (id TEXT PRIMARY KEY, value INTEGER)", "a1", { value: 1 });
        const first = await analyze(doc, "SELECT id, value FROM a");
        expect((await analyze(doc, "SELECT DISTINCT id, value FROM a")).result.status).toBe("unsupported");
        expect((await analyze(doc, "SELECT a.id FROM a JOIN a AS other ON true")).result.status).toBe("unsupported");

        removeTable(doc, old.tableId);
        const replacement = table(doc, "A again", "a", "CREATE TABLE a (id TEXT PRIMARY KEY, value INTEGER)", "a2", {
            value: 2,
        });
        const second = await analyze(doc, "SELECT id, value FROM a");
        expect(second.result.bareIdSource?.id).toBe(replacement.tableId);
        expect(isProjectQueryProvenanceCurrent(first.result, second.evidence)).toBe(false);
        expect(isProjectQueryProvenanceCurrent(second.result, second.evidence)).toBe(true);
    });
});
