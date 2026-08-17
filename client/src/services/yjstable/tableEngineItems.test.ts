// The items projection as the engine sees it: a relation a query can
// reference by name, materialized once per project and swept when unreachable.

import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Items, Project } from "../../schema/app-schema";
import { ITEMS_RELATION_NAME } from "./itemsRelation";
import { resetPgliteForTests, runSelect } from "./pgliteService";
import { projectSchemaName, quoteIdent } from "./sqlNames";
import { createTable, getTableHandles, setSchemaText } from "./tableDocs";
import { createTableEngineSession, resetTableEngineForTests, type TableDocConnector } from "./tableEngine";

/** No provider in unit tests: the subdoc is already "synced" locally. */
const localConnector: TableDocConnector = async () => ({
    waitForInitialSync: async () => ({ synced: true }),
    dispose: () => {},
});

function seedProject(projectId: string) {
    const projectDoc = new Y.Doc({ guid: projectId });
    const tree = Project.fromDoc(projectDoc).tree;

    const page = new Items(projectDoc, tree, "root").addNode("tester");
    page.text = "Tasks";
    const scheduled = new Items(projectDoc, tree, page.key).addNode("tester");
    scheduled.text = "Ship the calendar";
    scheduled.due = "2026-08-01T09:00:00Z";
    const unscheduled = new Items(projectDoc, tree, page.key).addNode("tester");
    unscheduled.text = "Think about it";

    const tableId = createTable(projectDoc, "Occurrences", "routine_occurrences");
    const table = getTableHandles(projectDoc, tableId)!;
    setSchemaText(table, "CREATE TABLE routine_occurrences (id TEXT PRIMARY KEY, title TEXT, due TIMESTAMPTZ)");

    return { projectDoc, tableId, table, page, scheduled, unscheduled };
}

afterEach(async () => {
    await resetTableEngineForTests();
});

afterAll(async () => {
    await resetPgliteForTests();
});

// The first test pays PGlite's cold-start cost.
describe("items relation in the table engine", { timeout: 30000 }, () => {
    it("resolves `outline_items` for a query that references it, without any view opening it", async () => {
        const projectId = "proj-items-query";
        const { projectDoc, tableId, table, scheduled } = seedProject(projectId);
        table.uiDef.set(
            "query",
            "SELECT title, due FROM routine_occurrences "
                + "UNION ALL SELECT text AS title, due FROM outline_items ORDER BY title",
        );

        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        try {
            const acquired = await session.acquire(tableId);
            const result = await acquired!.adapter.runQueryNow();
            // Only the scheduled item is projected; the note is not on the calendar.
            expect(result?.rows.map((r) => r.title)).toEqual([scheduled.text]);
        } finally {
            session.dispose();
        }
    });

    it("hands out a write-back provider for `outline_items` and drops the relation when evicted", async () => {
        const projectId = "proj-items-write";
        const { projectDoc, scheduled } = seedProject(projectId);
        const pgSchema = projectSchemaName(projectId);
        const relation = `${quoteIdent(pgSchema)}.${quoteIdent(ITEMS_RELATION_NAME)}`;

        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        const provider = await session.resolveRelation(ITEMS_RELATION_NAME);
        expect(provider?.sqlName).toBe(ITEMS_RELATION_NAME);
        expect(provider?.capabilities).toEqual({
            update: true,
            insert: { requiresDestination: true },
            delete: { requiresDisposition: true },
        });

        await provider!.applyWrite({
            op: "UPDATE",
            rowId: scheduled.key,
            column: "due",
            value: "2026-12-24T09:00:00Z",
        });
        expect(scheduled.due).toBe("2026-12-24T09:00:00Z");
        expect((await runSelect(`SELECT "due" FROM ${relation}`)).rows[0])
            .toEqual({ due: new Date("2026-12-24T09:00:00Z") });

        session.dispose();
        await resetTableEngineForTests();
        await expect(runSelect(`SELECT * FROM ${relation}`)).rejects.toThrow(/does not exist/);
    });

    it("materializes the projection once for several sessions of the same project", async () => {
        const projectId = "proj-items-shared";
        const { projectDoc } = seedProject(projectId);
        const first = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        const second = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        try {
            const a = await first.resolveRelation(ITEMS_RELATION_NAME);
            const b = await second.resolveRelation(ITEMS_RELATION_NAME);
            expect(a).toBe(b);
        } finally {
            first.dispose();
            second.dispose();
        }
    });

    it("returns nothing for a relation name the project does not own", async () => {
        const projectId = "proj-items-unknown";
        const { projectDoc } = seedProject(projectId);
        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        try {
            expect(await session.resolveRelation("nowhere")).toBeUndefined();
            expect((await session.resolveRelation("routine_occurrences"))?.sqlName)
                .toBe("routine_occurrences");
        } finally {
            session.dispose();
        }
    });
});
