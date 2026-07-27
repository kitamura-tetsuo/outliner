// `applyUnionedRowEdit` re-resolves the relation a unioned row's `source_kind`
// names and routes the write to it, addressed by `source_id`. Covers issue
// #4273's acceptance criterion that an edit on a unioned result reaches the
// correct relation provider and the correct row.

import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Items, Project } from "../../schema/app-schema";
import { analyzeQueryEditability } from "./queryAnalysis";
import { resetPgliteForTests } from "./pgliteService";
import { ITEMS_RELATION_NAME } from "./itemsRelation";
import type { RelationProvider, RelationWrite } from "./relationProvider";
import { RelationWriteError, TABLE_RELATION_CAPABILITIES } from "./relationProvider";
import { applyUnionedRowEdit } from "./relationRowWrite";
import { createTable, getTableHandles, setSchemaText } from "./tableDocs";
import { createTableEngineSession, resetTableEngineForTests, type TableDocConnector } from "./tableEngine";

/** No provider in unit tests: the subdoc is already "synced" locally. */
const localConnector: TableDocConnector = async () => ({
    waitForInitialSync: async () => ({ synced: true }),
    dispose: () => {},
});

/** Lets the adapter's debounced incremental-record flush reach PGlite. */
function waitMicrotasks(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(async () => {
    await resetTableEngineForTests();
});

afterAll(async () => {
    await resetPgliteForTests();
});

describe("applyUnionedRowEdit (resolver dispatch)", () => {
    class RecordingProvider implements RelationProvider {
        readonly sqlName = "recorded";
        readonly capabilities = TABLE_RELATION_CAPABILITIES;
        writes: RelationWrite[] = [];
        async materialize() {
            return true;
        }
        async applyWrite(write: RelationWrite) {
            this.writes.push(write);
        }
        dispose() {}
    }

    it("resolves the relation named by source_kind and writes the row named by source_id", async () => {
        const provider = new RecordingProvider();
        const resolver = {
            resolveRelation: async (sqlName: string) => sqlName === "widgets" ? provider : undefined,
        };

        await applyUnionedRowEdit(resolver, "widgets", "row-7", "title", "edited");

        expect(provider.writes).toEqual([
            { op: "UPDATE", rowId: "row-7", column: "title", value: "edited" },
        ]);
    });

    it("rejects a source_kind the project has no relation for", async () => {
        const resolver = { resolveRelation: async () => undefined };
        await expect(applyUnionedRowEdit(resolver, "nowhere", "row-1", "title", "x"))
            .rejects.toThrow(RelationWriteError);
    });
});

function seedProject(projectId: string) {
    const projectDoc = new Y.Doc({ guid: projectId });
    const tree = Project.fromDoc(projectDoc).tree;

    const page = new Items(projectDoc, tree, "root").addNode("tester");
    page.text = "Tasks";
    const scheduled = new Items(projectDoc, tree, page.key).addNode("tester");
    scheduled.text = "Ship the calendar";
    scheduled.due = "2026-08-01T09:00:00Z";

    const tableId = createTable(projectDoc, "Occurrences", "routine_occurrences");
    const table = getTableHandles(projectDoc, tableId)!;
    setSchemaText(
        table,
        "CREATE TABLE routine_occurrences (id TEXT PRIMARY KEY, title TEXT, due TIMESTAMPTZ)",
    );
    table.uiDef.set(
        "query",
        "SELECT 'routine_occurrences' AS source_kind, id AS source_id, title, due FROM routine_occurrences "
            + "UNION ALL "
            + "SELECT 'outline_items' AS source_kind, id AS source_id, text AS title, due FROM outline_items",
    );

    return { projectDoc, tableId, table, page, scheduled };
}

// The first test pays PGlite's cold-start cost.
describe("edit on a unioned result reaches the right relation and row", { timeout: 30000 }, () => {
    it("routes a write to the outline_items branch's row via applyUnionedRowEdit", async () => {
        const projectId = "proj-union-edit-items";
        const { projectDoc, tableId, table, scheduled } = seedProject(projectId);

        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        try {
            const acquired = await session.acquire(tableId);
            const result = await acquired!.adapter.runQueryNow();
            const editability = analyzeQueryEditability(
                String(table.uiDef.get("query")),
                acquired!.adapter.appliedSchema,
                result!.columns,
            );
            expect(editability.editable).toBe(true);
            expect(editability.rowIdentity).toBe("source");

            const itemRow = result!.rows.find((r) => r.source_kind === ITEMS_RELATION_NAME);
            expect(itemRow?.source_id).toBe(scheduled.key);

            await applyUnionedRowEdit(
                session,
                String(itemRow!.source_kind),
                String(itemRow!.source_id),
                "due",
                "2026-12-24T09:00:00Z",
            );

            expect(scheduled.due).toBe("2026-12-24T09:00:00Z");
        } finally {
            session.dispose();
        }
    });

    it("routes a write to the table branch's row without touching the outline item", async () => {
        const projectId = "proj-union-edit-table";
        const { projectDoc, tableId, table, scheduled } = seedProject(projectId);

        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        try {
            const acquired = await session.acquire(tableId);
            // Seed a routine_occurrences row directly through its own provider so
            // the union has something from the table side too.
            const tableProvider = await session.resolveRelation("routine_occurrences");
            await tableProvider!.applyWrite({
                op: "INSERT",
                values: { title: "Water plants", due: "2026-08-02T09:00:00Z" },
            });
            await waitMicrotasks();

            const result = await acquired!.adapter.runQueryNow();
            const tableRow = result!.rows.find((r) => r.source_kind === "routine_occurrences");
            expect(tableRow).toBeDefined();

            await applyUnionedRowEdit(
                session,
                String(tableRow!.source_kind),
                String(tableRow!.source_id),
                "title",
                "Water the plants",
            );

            const record = table.data.get(String(tableRow!.source_id));
            expect(record?.get("title")).toBe("Water the plants");
            // The unrelated outline item stayed untouched.
            expect(scheduled.text).toBe("Ship the calendar");
        } finally {
            session.dispose();
        }
    });
});
