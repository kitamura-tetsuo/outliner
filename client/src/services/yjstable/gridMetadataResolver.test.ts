import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { analyzeProjectQueryProvenance } from "../../../../shared/src/services/projectQueryProvenance";
import { Items, Project } from "../../schema/app-schema";
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

afterEach(async () => await resetTableEngineForTests());
afterAll(async () => await resetPgliteForTests());

describe("Grid metadata resolution", { timeout: 30_000 }, () => {
    it("uses B's exact applied schema instead of an unrelated same-shaped A", async () => {
        const doc = new Y.Doc({ guid: "grid-metadata-b" });
        const a = table(
            doc,
            "A",
            "a",
            "CREATE TABLE a (id TEXT PRIMARY KEY, status TEXT CHECK (status IN ('Wrong'))) ",
            "same",
            { status: "Wrong" },
        );
        const b = table(
            doc,
            "B",
            "b",
            "CREATE TABLE b (id TEXT PRIMARY KEY, status TEXT NOT NULL CHECK (status IN ('Open', 'Done'))) ",
            "same",
            { status: "Open" },
        );
        const select = createProjectSelectSession({
            projectDoc: doc,
            query: "SELECT id, status AS state FROM b",
            connect,
            requireExplicitAliases: false,
        });
        const resolver = createGridMetadataResolver({ projectDoc: doc, connect });
        try {
            const evidence = (await select.runNow())!;
            const result = await resolver.resolve(evidence, analyzeProjectQueryProvenance(evidence), select);

            expect(result.status).toBe("resolved");
            expect(result.columns.map(column => column.name)).toEqual(["id", "state"]);
            expect(result.rows).toEqual([{ id: "same", state: "Open" }]);
            expect(result.physicalColumns.map(column => [column.source.id, column.outputColumn, column.physicalColumn]))
                .toEqual([[b.tableId, "id", "id"], [b.tableId, "state", "status"]]);
            expect(result.physicalColumns[1]?.field).toMatchObject({
                name: "status",
                kind: "text",
                isNullable: false,
                checkOptions: ["Open", "Done"],
            });
            expect(result.physicalColumns.some(column => column.source.id === a.tableId)).toBe(false);
        } finally {
            resolver.dispose();
            select.dispose();
        }
    });

    it("keeps distinct positional fields and validation rules for UNION branches", async () => {
        const doc = new Y.Doc({ guid: "grid-metadata-union" });
        const a = table(
            doc,
            "A",
            "a",
            "CREATE TABLE a (id TEXT PRIMARY KEY, title TEXT CHECK (title IN ('A1', 'A2')), points INTEGER)",
            "a1",
            { title: "A1", points: 1 },
        );
        const b = table(
            doc,
            "B",
            "b",
            "CREATE TABLE b (id TEXT PRIMARY KEY, label TEXT CHECK (label IN ('B1', 'B2')), score INTEGER)",
            "b1",
            { label: "B1", score: 2 },
        );
        const query = "SELECT 'a' AS source_kind, id AS source_id, title AS shown, points + 1 AS calculated FROM a "
            + "UNION ALL SELECT 'b', id, label, score FROM b";
        const select = createProjectSelectSession({ projectDoc: doc, query, connect, requireExplicitAliases: false });
        const resolver = createGridMetadataResolver({ projectDoc: doc, connect });
        try {
            const evidence = (await select.runNow())!;
            const result = await resolver.resolve(evidence, analyzeProjectQueryProvenance(evidence), select);
            const shown = result.physicalColumns.filter(column => column.outputColumn === "shown");

            expect(result.status).toBe("resolved");
            expect(shown.map(column => [column.source.id, column.physicalColumn, column.field?.checkOptions]))
                .toEqual([
                    [a.tableId, "title", ["A1", "A2"]],
                    [b.tableId, "label", ["B1", "B2"]],
                ]);
            expect(
                result.physicalColumns.filter(column => column.outputColumn === "calculated").map(column => [
                    column.source.id,
                    column.physicalColumn,
                ]),
            ).toEqual([[b.tableId, "score"]]);
        } finally {
            resolver.dispose();
            select.dispose();
        }
    });

    it("resolves writable metadata for a Table and outline_items UNION", async () => {
        const doc = new Y.Doc({ guid: "grid-metadata-system-union" });
        const tree = Project.fromDoc(doc).tree;
        const page = new Items(doc, tree, "root").addNode("tester");
        page.text = "Tasks";
        const item = new Items(doc, tree, page.key).addNode("tester");
        item.text = "Outline";
        item.due = "2026-08-01T09:00:00Z";
        table(
            doc,
            "Occurrences",
            "routine_occurrences",
            "CREATE TABLE routine_occurrences (id TEXT PRIMARY KEY, text TEXT, due TIMESTAMPTZ)",
            "table-row",
            { text: "Table", due: "2026-08-01T09:00:00Z" },
        );
        const query = "SELECT 'routine_occurrences' AS source_kind, id AS source_id, text, due "
            + "FROM routine_occurrences UNION ALL "
            + "SELECT 'outline_items', id, text, due FROM outline_items";
        const select = createProjectSelectSession({ projectDoc: doc, query, connect, requireExplicitAliases: false });
        const resolver = createGridMetadataResolver({ projectDoc: doc, connect });
        try {
            const evidence = (await select.runNow())!;
            const result = await resolver.resolve(evidence, analyzeProjectQueryProvenance(evidence), select);
            expect(result.status).toBe("resolved");
            expect(
                result.physicalColumns
                    .filter(column => column.outputColumn === "text")
                    .map(column => [column.source.sqlName, column.field?.kind]),
            ).toEqual([
                ["routine_occurrences", "text"],
                ["outline_items", "text"],
            ]);
        } finally {
            resolver.dispose();
            select.dispose();
        }
    });
});
