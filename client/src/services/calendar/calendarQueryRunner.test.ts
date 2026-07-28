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

    describe("view.range_start / view.range_end injection (§6.4)", () => {
        it("is readable via current_setting inside the query when a range is passed", async () => {
            const projectId = "proj-calendar-range-readable";
            const { projectDoc } = seedProject(projectId);
            const pgSchema = projectSchemaName(projectId);
            const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
            try {
                const range = { start: new Date("2026-08-01T00:00:00Z"), end: new Date("2026-08-31T00:00:00Z") };
                const outcome = await runCalendarQuery(
                    session,
                    pgSchema,
                    "SELECT current_setting('view.range_start')::timestamptz AS range_start, "
                        + "current_setting('view.range_end')::timestamptz AS range_end",
                    range,
                );
                expect(outcome.error).toBeUndefined();
                expect(outcome.result?.rows).toEqual([
                    { range_start: range.start.toISOString(), range_end: range.end.toISOString() },
                ]);
            } finally {
                session.dispose();
            }
        });

        it("does not leak the range into a later query that runs without one (transaction-local)", async () => {
            const projectId = "proj-calendar-range-local";
            const { projectDoc } = seedProject(projectId);
            const pgSchema = projectSchemaName(projectId);
            const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
            try {
                await runCalendarQuery(session, pgSchema, "SELECT 1", {
                    start: new Date("2026-08-01T00:00:00Z"),
                    end: new Date("2026-08-31T00:00:00Z"),
                });
                const outcome = await runCalendarQuery(
                    session,
                    pgSchema,
                    "SELECT current_setting('view.range_start', true) AS range_start",
                );
                expect(outcome.error).toBeUndefined();
                // Postgres/PGlite report a missing setting (`missing_ok = true`) as
                // an empty string rather than SQL NULL; either way it must not be
                // the ISO instant set by the previous, already-committed transaction.
                expect(outcome.result?.rows).toEqual([{ range_start: "" }]);
            } finally {
                session.dispose();
            }
        });

        it("supports the overlap idiom: entries starting before the window but overlapping into it are included", async () => {
            const projectId = "proj-calendar-range-overlap";
            const { projectDoc, scheduled } = seedProject(projectId);
            // A second item whose start+duration overlaps into the visible window
            // from before it, and a third that ends before the window starts.
            const tree = Project.fromDoc(projectDoc).tree;
            const overlapping = new Items(projectDoc, tree, "root").addNode("tester");
            overlapping.text = "Spills into the window";
            overlapping.allDay = false;
            overlapping.start = "2026-07-31T22:00:00Z";
            overlapping.duration = "PT4H";
            const before = new Items(projectDoc, tree, "root").addNode("tester");
            before.text = "Entirely before the window";
            before.allDay = false;
            before.start = "2026-07-30T09:00:00Z";
            before.duration = "PT1H";

            const pgSchema = projectSchemaName(projectId);
            const session = createTableEngineSession({ projectDoc, projectId, connect: localConnector });
            try {
                const outcome = await runCalendarQuery(
                    session,
                    pgSchema,
                    `SELECT id, text AS title, 'item' AS source_kind, id AS source_id
                     FROM outline_items
                     WHERE start_at < current_setting('view.range_end')::timestamptz
                       AND start_at + duration > current_setting('view.range_start')::timestamptz
                     ORDER BY start_at`,
                    { start: new Date("2026-08-01T00:00:00Z"), end: new Date("2026-08-02T00:00:00Z") },
                );
                expect(outcome.error).toBeUndefined();
                expect(outcome.result?.rows.map((r) => r.title)).toEqual(["Spills into the window"]);
                expect(outcome.result?.rows.map((r) => r.title)).not.toContain("Entirely before the window");
                expect(outcome.result?.rows.map((r) => r.title)).not.toContain(scheduled.text);
            } finally {
                session.dispose();
            }
        });
    });
});
