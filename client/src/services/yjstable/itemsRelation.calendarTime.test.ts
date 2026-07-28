import { afterAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { YTree } from "yjs-orderedtree";
import { Items, Project } from "../../schema/app-schema";
import { ITEMS_RELATION_NAME, ItemsRelationProvider } from "./itemsRelation";
import { resetPgliteForTests, runSelect } from "./pgliteService";
import { projectSchemaName, quoteIdent } from "./sqlNames";

let counter = 0;

interface ScheduleOpts {
    due?: string;
    allDay?: boolean;
    start?: string;
    duration?: string;
}

interface Fixture {
    projectDoc: Y.Doc;
    tree: YTree;
    pgSchema: string;
    provider: ItemsRelationProvider;
    add: (parentKey: string, text: string, opts?: ScheduleOpts) => string;
    rows: () => Promise<Record<string, unknown>[]>;
}

function makeProject(): Fixture {
    const projectDoc = new Y.Doc({ guid: `items-rel-time-${counter++}` });
    const project = Project.fromDoc(projectDoc);
    const tree = project.tree;
    const pgSchema = projectSchemaName(projectDoc.guid);
    const provider = new ItemsRelationProvider({ projectDoc, pgSchema });

    const add = (parentKey: string, text: string, opts: ScheduleOpts = {}): string => {
        const item = new Items(projectDoc, tree, parentKey).addNode("tester");
        item.text = text;
        if (opts.due !== undefined) item.due = opts.due;
        if (opts.allDay !== undefined) item.allDay = opts.allDay;
        if (opts.start !== undefined) item.start = opts.start;
        if (opts.duration !== undefined) item.duration = opts.duration;
        return item.key;
    };

    const rows = async () =>
        (await runSelect(
            `SELECT * FROM ${quoteIdent(pgSchema)}.${quoteIdent(ITEMS_RELATION_NAME)} ORDER BY "text"`,
        )).rows as Record<string, unknown>[];

    return { projectDoc, tree, pgSchema, provider, add, rows };
}

function settle(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 20));
}

afterAll(async () => {
    await resetPgliteForTests();
});

describe("items relation calendar time model", { timeout: 30000 }, () => {
    it("projects an item that carries only `start`, without `due`", async () => {
        const f = makeProject();
        const page = f.add("root", "Page");
        f.add(page, "Plan", { allDay: false, start: "2026-08-01T09:00:00Z" });
        f.add(page, "Just a note");

        expect(await f.provider.materialize()).toBe(true);
        try {
            const rows = await f.rows();
            expect(rows.map((r) => r.text)).toEqual(["Plan"]);
        } finally {
            f.provider.dispose();
        }
    });

    it("still projects an item that carries only `due`, without `start`", async () => {
        const f = makeProject();
        const page = f.add("root", "Page");
        const key = f.add(page, "Deadline", { due: "2026-08-07T00:00:00Z" });

        expect(await f.provider.materialize()).toBe(true);
        try {
            const rows = await f.rows();
            expect(rows).toHaveLength(1);
            expect(rows[0].due).toEqual(new Date("2026-08-07T00:00:00Z"));
            // Absent `start` shape: every start-related column stays NULL,
            // exactly as before `start` existed.
            expect(rows[0].all_day).toBeNull();
            expect(rows[0].start_on).toBeNull();
            expect(rows[0].start_at).toBeNull();
            expect(rows[0].duration).toBeNull();

            const value = f.tree.getNodeValueFromKey(key) as Y.Map<unknown>;
            expect(value.get("start")).toBeUndefined();
        } finally {
            f.provider.dispose();
        }
    });

    it("does not project an item carrying neither `due` nor `start`", async () => {
        const f = makeProject();
        const page = f.add("root", "Page");
        f.add(page, "Note only");
        f.add(page, "Has duration but no start", { duration: "PT1H" });

        expect(await f.provider.materialize()).toBe(true);
        try {
            expect(await f.rows()).toHaveLength(0);
        } finally {
            f.provider.dispose();
        }
    });

    it("projects an all-day entry into start_on, leaving start_at NULL", async () => {
        const f = makeProject();
        const page = f.add("root", "Page");
        f.add(page, "Trip", { allDay: true, start: "2026-08-01" });

        expect(await f.provider.materialize()).toBe(true);
        try {
            const rows = await f.rows();
            expect(rows).toHaveLength(1);
            expect(rows[0].all_day).toBe(true);
            expect(rows[0].start_on).toEqual(new Date("2026-08-01T00:00:00Z"));
            expect(rows[0].start_at).toBeNull();
        } finally {
            f.provider.dispose();
        }
    });

    it("projects a timed entry into start_at, leaving start_on NULL", async () => {
        const f = makeProject();
        const page = f.add("root", "Page");
        f.add(page, "Standup", { allDay: false, start: "2026-08-01T09:00:00Z" });

        expect(await f.provider.materialize()).toBe(true);
        try {
            const rows = await f.rows();
            expect(rows).toHaveLength(1);
            expect(rows[0].all_day).toBe(false);
            expect(rows[0].start_on).toBeNull();
            expect(rows[0].start_at).toEqual(new Date("2026-08-01T09:00:00Z"));
        } finally {
            f.provider.dispose();
        }
    });

    it("never carries both start_on and start_at for any row", async () => {
        const f = makeProject();
        const page = f.add("root", "Page");
        f.add(page, "All day", { allDay: true, start: "2026-08-01" });
        f.add(page, "Timed", { allDay: false, start: "2026-08-01T09:00:00Z" });
        f.add(page, "Deadline only", { due: "2026-08-02T00:00:00Z" });

        expect(await f.provider.materialize()).toBe(true);
        try {
            const rows = await f.rows();
            expect(rows).toHaveLength(3);
            for (const row of rows) {
                const nonNull = [row.start_on, row.start_at].filter((v) => v !== null);
                expect(nonNull.length).toBeLessThanOrEqual(1);
            }
        } finally {
            f.provider.dispose();
        }
    });

    it("projects duration as an INTERVAL that survives the round trip", async () => {
        const f = makeProject();
        const page = f.add("root", "Page");
        f.add(page, "Focus block", {
            allDay: false,
            start: "2026-08-01T09:00:00Z",
            duration: "PT1H30M",
        });

        expect(await f.provider.materialize()).toBe(true);
        try {
            const rows = await f.rows();
            expect(rows).toHaveLength(1);
            expect(rows[0].duration).toBe("01:30:00");
        } finally {
            f.provider.dispose();
        }
    });

    it("filters and orders by start_at with BETWEEN, without casting", async () => {
        const f = makeProject();
        const page = f.add("root", "Page");
        f.add(page, "Early", { allDay: false, start: "2026-08-01T09:00:00Z" });
        f.add(page, "Middle", { allDay: false, start: "2026-08-05T09:00:00Z" });
        f.add(page, "Late", { allDay: false, start: "2026-08-20T09:00:00Z" });

        expect(await f.provider.materialize()).toBe(true);
        try {
            const result = await runSelect(
                `SELECT "text" FROM ${quoteIdent(f.pgSchema)}.${quoteIdent(ITEMS_RELATION_NAME)}
                 WHERE "start_at" BETWEEN $1 AND $2
                 ORDER BY "start_at"`,
                ["2026-08-01T00:00:00Z", "2026-08-10T00:00:00Z"],
            );
            expect(result.rows.map((r) => (r as { text: string; }).text)).toEqual(["Early", "Middle"]);
        } finally {
            f.provider.dispose();
        }
    });

    it("keeps an all-day start_on invariant under a session timezone change, unlike start_at", async () => {
        const f = makeProject();
        const page = f.add("root", "Page");
        const allDayKey = f.add(page, "Trip", { allDay: true, start: "2026-08-01" });
        const timedKey = f.add(page, "Standup", { allDay: false, start: "2026-08-01T09:00:00Z" });

        expect(await f.provider.materialize()).toBe(true);
        try {
            const textRow = async (id: string) =>
                (await runSelect(
                    `SELECT to_char("start_on", 'YYYY-MM-DD') AS start_on_text,
                            to_char("start_at", 'YYYY-MM-DD"T"HH24:MI') AS start_at_text
                     FROM ${quoteIdent(f.pgSchema)}.${quoteIdent(ITEMS_RELATION_NAME)}
                     WHERE "id" = $1`,
                    [id],
                )).rows[0] as { start_on_text: string | null; start_at_text: string | null; };

            await runSelect("SET TIME ZONE 'UTC'");
            const allDayUtc = await textRow(allDayKey);
            const timedUtc = await textRow(timedKey);

            await runSelect("SET TIME ZONE 'Pacific/Kiritimati'"); // UTC+14
            const allDayShifted = await textRow(allDayKey);
            const timedShifted = await textRow(timedKey);

            // A floating date is identical for every viewer...
            expect(allDayShifted.start_on_text).toBe(allDayUtc.start_on_text);
            // ...an instant's local rendering is not.
            expect(timedShifted.start_at_text).not.toBe(timedUtc.start_at_text);
        } finally {
            await runSelect("SET TIME ZONE 'UTC'");
            f.provider.dispose();
        }
    });

    it("does not shift an all-day `due` under the exclusive-end convention", async () => {
        const f = makeProject();
        const page = f.add("root", "Page");
        f.add(page, "Milestone", { due: "2026-08-01T00:00:00Z" });

        expect(await f.provider.materialize()).toBe(true);
        try {
            const rows = await f.rows();
            // `due` is read back exactly as stored: nothing in the projection
            // applies the all-day end-exclusive adjustment to it (§6.1).
            expect(rows[0].due).toEqual(new Date("2026-08-01T00:00:00Z"));
        } finally {
            f.provider.dispose();
        }
    });

    it("writes all_day, start and duration through the relation onto the item's fields", async () => {
        const f = makeProject();
        const page = f.add("root", "Page");
        const key = f.add(page, "Card", { allDay: false, start: "2026-08-01T09:00:00Z" });
        expect(await f.provider.materialize()).toBe(true);
        try {
            await f.provider.applyWrite({
                op: "UPDATE",
                rowId: key,
                column: "start_on",
                value: "2026-08-10",
            });
            await f.provider.applyWrite({
                op: "UPDATE",
                rowId: key,
                column: "duration",
                value: "P1D",
            });

            const value = f.tree.getNodeValueFromKey(key) as Y.Map<unknown>;
            expect(value.get("start")).toBe("2026-08-10");
            // Writing through `start_on` records the all-day shape.
            expect(value.get("allDay")).toBe(true);
            expect(value.get("duration")).toBe("P1D");

            await settle();
            const rows = await f.rows();
            expect(rows[0].all_day).toBe(true);
            expect(rows[0].start_on).toEqual(new Date("2026-08-10T00:00:00Z"));
            expect(rows[0].start_at).toBeNull();
        } finally {
            f.provider.dispose();
        }
    });

    it("clears both start and allDay when the relation writes an empty start_at", async () => {
        const f = makeProject();
        const page = f.add("root", "Page");
        const key = f.add(page, "Card", {
            due: "2026-08-07T00:00:00Z",
            allDay: false,
            start: "2026-08-01T09:00:00Z",
        });
        expect(await f.provider.materialize()).toBe(true);
        try {
            await f.provider.applyWrite({
                op: "UPDATE",
                rowId: key,
                column: "start_at",
                value: null,
            });

            const value = f.tree.getNodeValueFromKey(key) as Y.Map<unknown>;
            expect(value.get("start")).toBeUndefined();
            expect(value.get("allDay")).toBeUndefined();
            // `due` is untouched: the two fields are cleared independently.
            expect(value.get("due")).toBe("2026-08-07T00:00:00Z");
        } finally {
            f.provider.dispose();
        }
    });

    it("clearing the projected field on DELETE removes an item scheduled only by `start`", async () => {
        const f = makeProject();
        const page = f.add("root", "Page");
        const key = f.add(page, "Plan", { allDay: true, start: "2026-08-01" });
        expect(await f.provider.materialize()).toBe(true);
        try {
            await f.provider.applyWrite({
                op: "DELETE",
                rowId: key,
                disposition: "clear-projected-field",
            });
            expect(await f.rows()).toHaveLength(0);

            const value = f.tree.getNodeValueFromKey(key) as Y.Map<unknown>;
            expect(value.get("start")).toBeUndefined();
            expect(value.get("allDay")).toBeUndefined();
            expect((value.get("text") as Y.Text).toString()).toBe("Plan");
        } finally {
            f.provider.dispose();
        }
    });
});
