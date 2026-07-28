// Real PGlite + the real table engine session, no mocking (AGENTS.md §2):
// the same pattern tableEngineItems.test.ts uses for `outline_items`.

import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Items, Project } from "../../schema/app-schema";
import { resetPgliteForTests } from "../yjstable/pgliteService";
import { projectSchemaName } from "../yjstable/sqlNames";
import { createTableEngineSession, resetTableEngineForTests, type TableDocConnector } from "../yjstable/tableEngine";
import { runCalendarQuery } from "./calendarQueryRunner";

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
    return { projectDoc, scheduled };
}

afterEach(async () => {
    await resetTableEngineForTests();
});

afterAll(async () => {
    await resetPgliteForTests();
});

describe("runCalendarQuery", { timeout: 30000 }, () => {
    it("returns an empty result for a blank query, without touching the engine", async () => {
        const outcome = await runCalendarQuery({ resolveRelation: async () => undefined }, "irrelevant", "   ");
        expect(outcome).toEqual({ result: { columns: [], rows: [] } });
    });

    it("materializes a relation the query references (outline_items) and returns its columns in order", async () => {
        const projectId = "proj-calendar-query";
        const { projectDoc, scheduled } = seedProject(projectId);
        const pgSchema = projectSchemaName(projectId);
        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        try {
            const outcome = await runCalendarQuery(
                session,
                pgSchema,
                "SELECT id, text AS title, due, 'item' AS source_kind, id AS source_id FROM outline_items",
            );
            expect(outcome.error).toBeUndefined();
            expect(outcome.result?.columns).toEqual(["id", "title", "due", "source_kind", "source_id"]);
            expect(outcome.result?.rows).toEqual([
                {
                    id: scheduled.key,
                    title: scheduled.text,
                    due: "2026-08-01T09:00:00.000Z",
                    source_kind: "item",
                    source_id: scheduled.key,
                },
            ]);
        } finally {
            session.dispose();
        }
    });

    it("surfaces a query error instead of throwing", async () => {
        const projectId = "proj-calendar-query-error";
        const { projectDoc } = seedProject(projectId);
        const pgSchema = projectSchemaName(projectId);
        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        try {
            const outcome = await runCalendarQuery(session, pgSchema, "SELECT * FROM nowhere_at_all");
            expect(outcome.result).toBeUndefined();
            expect(outcome.error).toBeDefined();
        } finally {
            session.dispose();
        }
    });

    it("rejects a non-SELECT statement", async () => {
        const projectId = "proj-calendar-query-write";
        const { projectDoc } = seedProject(projectId);
        const pgSchema = projectSchemaName(projectId);
        const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
        try {
            const outcome = await runCalendarQuery(session, pgSchema, "DELETE FROM outline_items");
            expect(outcome.result).toBeUndefined();
            expect(outcome.error).toMatch(/only select queries/i);
        } finally {
            session.dispose();
        }
    });
});
