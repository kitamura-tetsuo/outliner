import { afterAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { YTree } from "yjs-orderedtree";
import { Items, Project } from "../../schema/app-schema";
import { ITEMS_RELATION_NAME, ItemsRelationProvider } from "./itemsRelation";
import { resetPgliteForTests, runSelect } from "./pgliteService";
import { projectSchemaName, quoteIdent } from "./sqlNames";

let counter = 0;

interface RecurrenceOpts {
    rrule?: string;
    recurrenceDtstart?: string;
    recurrenceTimezone?: string;
    recurrenceParentId?: string;
    recurrenceOccurrenceId?: string;
    start?: string;
}

interface Fixture {
    projectDoc: Y.Doc;
    tree: YTree;
    pgSchema: string;
    provider: ItemsRelationProvider;
    add: (parentKey: string, text: string, opts?: RecurrenceOpts) => string;
    rows: () => Promise<Record<string, unknown>[]>;
}

function makeProject(): Fixture {
    const projectDoc = new Y.Doc({ guid: `items-rel-recurrence-${counter++}` });
    const project = Project.fromDoc(projectDoc);
    const tree = project.tree;
    const pgSchema = projectSchemaName(projectDoc.guid);
    const provider = new ItemsRelationProvider({ projectDoc, pgSchema });

    const add = (parentKey: string, text: string, opts: RecurrenceOpts = {}): string => {
        const item = new Items(projectDoc, tree, parentKey).addNode("tester");
        item.text = text;
        if (opts.rrule !== undefined) item.rrule = opts.rrule;
        if (opts.recurrenceDtstart !== undefined) item.recurrenceDtstart = opts.recurrenceDtstart;
        if (opts.recurrenceTimezone !== undefined) item.recurrenceTimezone = opts.recurrenceTimezone;
        if (opts.recurrenceParentId !== undefined) item.recurrenceParentId = opts.recurrenceParentId;
        if (opts.recurrenceOccurrenceId !== undefined) item.recurrenceOccurrenceId = opts.recurrenceOccurrenceId;
        if (opts.start !== undefined) item.start = opts.start;
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

describe("items relation recurrence", { timeout: 30000 }, () => {
    it("projects a recurring item's anchor row, though it carries neither due nor start", async () => {
        const f = makeProject();
        const page = f.add("root", "Page");
        f.add(page, "Standup", {
            rrule: "FREQ=WEEKLY;BYDAY=MO",
            recurrenceDtstart: "2026-08-03T09:00:00",
            recurrenceTimezone: "America/New_York",
        });
        f.add(page, "Just a note");

        expect(await f.provider.materialize()).toBe(true);
        try {
            const rows = await f.rows();
            expect(rows.map((r) => r.text)).toEqual(["Standup"]);
            expect(rows[0].rrule).toBe("FREQ=WEEKLY;BYDAY=MO");
            expect(rows[0].recurrence_dtstart).toBe("2026-08-03T09:00:00");
            expect(rows[0].recurrence_timezone).toBe("America/New_York");
            expect(rows[0].due).toBeNull();
        } finally {
            f.provider.dispose();
        }
    });

    it("projects an override row, identified by recurrence_parent_id and recurrence_occurrence_id", async () => {
        const f = makeProject();
        const page = f.add("root", "Page");
        const sourceKey = f.add(page, "Standup", {
            rrule: "FREQ=WEEKLY;BYDAY=MO",
            recurrenceDtstart: "2026-08-03T09:00:00",
            recurrenceTimezone: "America/New_York",
        });
        const source = f.tree.getNodeValueFromKey(sourceKey) as Y.Map<unknown>;
        const sourceId = source.get("id") as string;

        f.add(page, "Standup (moved)", {
            recurrenceParentId: sourceId,
            recurrenceOccurrenceId: "2026-08-10T09:00:00",
            start: "2026-08-10T14:00:00Z",
        });

        expect(await f.provider.materialize()).toBe(true);
        try {
            const rows = await f.rows();
            const override = rows.find((r) => r.text === "Standup (moved)");
            expect(override?.recurrence_parent_id).toBe(sourceId);
            expect(override?.recurrence_occurrence_id).toBe("2026-08-10T09:00:00");
            expect(override?.start_at).toEqual(new Date("2026-08-10T14:00:00Z"));
        } finally {
            f.provider.dispose();
        }
    });

    it("does not project an item carrying neither due, start, rrule nor a recurrence parent", async () => {
        const f = makeProject();
        const page = f.add("root", "Page");
        f.add(page, "Note only");

        expect(await f.provider.materialize()).toBe(true);
        try {
            expect(await f.rows()).toHaveLength(0);
        } finally {
            f.provider.dispose();
        }
    });

    it("writes rrule through the relation, eagerly creating recurrenceExdate", async () => {
        const f = makeProject();
        const page = f.add("root", "Page");
        const key = f.add(page, "Standup");
        expect(await f.provider.materialize()).toBe(true);
        try {
            await f.provider.applyWrite({
                op: "UPDATE",
                rowId: key,
                column: "rrule",
                value: "FREQ=DAILY",
            });
            await f.provider.applyWrite({
                op: "UPDATE",
                rowId: key,
                column: "recurrence_dtstart",
                value: "2026-08-03T09:00:00",
            });
            await f.provider.applyWrite({
                op: "UPDATE",
                rowId: key,
                column: "recurrence_timezone",
                value: "UTC",
            });

            const value = f.tree.getNodeValueFromKey(key) as Y.Map<unknown>;
            expect(value.get("rrule")).toBe("FREQ=DAILY");
            expect(value.get("recurrenceDtstart")).toBe("2026-08-03T09:00:00");
            expect(value.get("recurrenceTimezone")).toBe("UTC");
            expect(value.get("recurrenceExdate")).toBeInstanceOf(Y.Array);

            await settle();
            const rows = await f.rows();
            expect(rows[0].rrule).toBe("FREQ=DAILY");
        } finally {
            f.provider.dispose();
        }
    });

    it("clearing the projected field on DELETE also clears the recurrence fields", async () => {
        const f = makeProject();
        const page = f.add("root", "Page");
        const key = f.add(page, "Standup", {
            rrule: "FREQ=WEEKLY;BYDAY=MO",
            recurrenceDtstart: "2026-08-03T09:00:00",
            recurrenceTimezone: "America/New_York",
        });
        expect(await f.provider.materialize()).toBe(true);
        try {
            await f.provider.applyWrite({
                op: "DELETE",
                rowId: key,
                disposition: "clear-projected-field",
            });
            expect(await f.rows()).toHaveLength(0);

            const value = f.tree.getNodeValueFromKey(key) as Y.Map<unknown>;
            expect(value.get("rrule")).toBeUndefined();
            expect(value.get("recurrenceDtstart")).toBeUndefined();
            expect(value.get("recurrenceTimezone")).toBeUndefined();
            expect(value.get("recurrenceExdate")).toBeUndefined();
            expect((value.get("text") as Y.Text).toString()).toBe("Standup");
        } finally {
            f.provider.dispose();
        }
    });

    it("rejects a write to recurrence_parent_id: it is set only by recurrenceEditing.ts", async () => {
        const f = makeProject();
        const page = f.add("root", "Page");
        const key = f.add(page, "Standup", { rrule: "FREQ=DAILY" });
        expect(await f.provider.materialize()).toBe(true);
        try {
            await expect(
                f.provider.applyWrite({
                    op: "UPDATE",
                    rowId: key,
                    column: "recurrence_parent_id",
                    value: "some-id",
                }),
            ).rejects.toThrow(/not writable/);
        } finally {
            f.provider.dispose();
        }
    });
});
