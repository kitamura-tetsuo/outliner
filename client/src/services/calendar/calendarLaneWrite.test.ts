import { afterAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { YTree } from "yjs-orderedtree";
import { Items, Project } from "../../schema/app-schema";
import { ITEMS_RELATION_NAME, ItemsRelationProvider } from "../yjstable/itemsRelation";
import { resetPgliteForTests, runSelect } from "../yjstable/pgliteService";
import type { RelationProvider, RelationWrite } from "../yjstable/relationProvider";
import { TABLE_RELATION_CAPABILITIES } from "../yjstable/relationProvider";
import { projectSchemaName, quoteIdent } from "../yjstable/sqlNames";
import type { CalendarEntry } from "./calendarEntries";
import { isLaneDropWritable, writeCalendarLaneDrop } from "./calendarLaneWrite";

function entry(overrides: Partial<CalendarEntry> & { raw: Record<string, unknown>; }): CalendarEntry {
    return { key: "k", title: "t", sourceKind: "item", sourceId: "row-1", ...overrides };
}

describe("isLaneDropWritable", () => {
    const writableColumns = new Map([["labels", "tags"]]);

    it("is writable when the axis resolves to a writable column and the entry is addressable", () => {
        expect(isLaneDropWritable({ sourceKind: "item", sourceId: "1" }, "labels", writableColumns)).toBe(true);
    });

    it("is not writable when the axis has no writable origin (a calculated column)", () => {
        expect(isLaneDropWritable({ sourceKind: "item", sourceId: "1" }, "bucket", writableColumns)).toBe(false);
    });

    it("is not writable when the entry has no source_kind/source_id", () => {
        expect(isLaneDropWritable({ sourceKind: undefined, sourceId: undefined }, "labels", writableColumns)).toBe(
            false,
        );
    });

    it("is not writable when there is no group axis at all", () => {
        expect(isLaneDropWritable({ sourceKind: "item", sourceId: "1" }, undefined, writableColumns)).toBe(false);
    });
});

describe("writeCalendarLaneDrop (dispatch)", () => {
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

    it("replaces the whole tag set with a single UPDATE for a plain drop", async () => {
        const provider = new RecordingProvider();
        const resolver = { resolveRelation: async () => provider };
        const e = entry({ raw: { labels: JSON.stringify(["old"]) } });

        await writeCalendarLaneDrop(resolver, e, "labels", "tags", "new", "replace");

        expect(provider.writes).toEqual([
            { op: "UPDATE", rowId: "row-1", column: "tags", value: JSON.stringify(["new"]) },
        ]);
    });

    it("clears the tag set when dropped on the NULL lane in replace mode", async () => {
        const provider = new RecordingProvider();
        const resolver = { resolveRelation: async () => provider };
        const e = entry({ raw: { labels: JSON.stringify(["old"]) } });

        await writeCalendarLaneDrop(resolver, e, "labels", "tags", undefined, "replace");

        expect(provider.writes).toEqual([{ op: "UPDATE", rowId: "row-1", column: "tags", value: "[]" }]);
    });

    it("adds via UPDATE_APPEND for a Ctrl/Cmd drop, keeping existing tags", async () => {
        const provider = new RecordingProvider();
        const resolver = { resolveRelation: async () => provider };
        const e = entry({ raw: { labels: JSON.stringify(["old"]) } });

        await writeCalendarLaneDrop(resolver, e, "labels", "tags", "new", "add");

        expect(provider.writes).toEqual([
            { op: "UPDATE_APPEND", rowId: "row-1", column: "tags", value: "new" },
        ]);
    });

    it("is a no-op adding to the NULL lane", async () => {
        const provider = new RecordingProvider();
        const resolver = { resolveRelation: async () => provider };
        const e = entry({ raw: { labels: JSON.stringify(["old"]) } });

        await writeCalendarLaneDrop(resolver, e, "labels", "tags", undefined, "add");

        expect(provider.writes).toEqual([]);
    });

    it("replaces a scalar (non-multi-valued) axis with the lane's value directly", async () => {
        const provider = new RecordingProvider();
        const resolver = { resolveRelation: async () => provider };
        const e = entry({ raw: { bucket: "alpha" } });

        await writeCalendarLaneDrop(resolver, e, "bucket", "bucket", "beta", "replace");

        expect(provider.writes).toEqual([{ op: "UPDATE", rowId: "row-1", column: "bucket", value: "beta" }]);
    });

    it("refuses an 'add' drop onto a scalar axis", async () => {
        const provider = new RecordingProvider();
        const resolver = { resolveRelation: async () => provider };
        const e = entry({ raw: { bucket: "alpha" } });

        await expect(writeCalendarLaneDrop(resolver, e, "bucket", "bucket", "beta", "add")).rejects.toThrow(
            /not multi-valued/,
        );
    });

    it("refuses a write for an entry with no writable origin", async () => {
        const provider = new RecordingProvider();
        const resolver = { resolveRelation: async () => provider };
        const e = entry({ sourceKind: undefined, sourceId: undefined, raw: {} });

        await expect(writeCalendarLaneDrop(resolver, e, "labels", "tags", "x", "replace")).rejects.toThrow(
            /writable origin/,
        );
    });
});

// The real items-relation path: a plain drop replaces, a Ctrl/Cmd drop merges
// (concurrent-add safety), exercised end to end like itemsRelation.tags.test.ts.
let counter = 0;

function makeProject() {
    const projectDoc = new Y.Doc({ guid: `cal-lane-write-${counter++}` });
    const project = Project.fromDoc(projectDoc);
    const tree = project.tree;
    const pgSchema = projectSchemaName(projectDoc.guid);
    const provider = new ItemsRelationProvider({ projectDoc, pgSchema });

    const add = (parentKey: string, text: string, tags?: string[]): string => {
        const item = new Items(projectDoc, tree, parentKey).addNode("tester");
        item.text = text;
        item.due = "2026-08-02T09:00:00Z";
        if (tags) item.tags = tags;
        return item.key;
    };

    const rows = async () =>
        (await runSelect(
            `SELECT * FROM ${quoteIdent(pgSchema)}.${quoteIdent(ITEMS_RELATION_NAME)} ORDER BY "text"`,
        )).rows as Record<string, unknown>[];

    return { projectDoc, tree, pgSchema, provider, add, rows };
}

afterAll(async () => {
    await resetPgliteForTests();
});

describe("writeCalendarLaneDrop against the real items relation", { timeout: 30000 }, () => {
    it("a plain drop replaces the item's tag set end to end", async () => {
        const f = makeProject();
        const page = f.add("root", "Page");
        const key = f.add(page, "Card", ["old"]);
        expect(await f.provider.materialize()).toBe(true);
        try {
            const e = entry({ sourceKind: ITEMS_RELATION_NAME, sourceId: key, raw: { tags: JSON.stringify(["old"]) } });
            const resolver = { resolveRelation: async () => f.provider };
            await writeCalendarLaneDrop(resolver, e, "tags", "tags", "urgent", "replace");

            const value = f.tree.getNodeValueFromKey(key) as Y.Map<unknown>;
            expect((value.get("tags") as Y.Array<string>).toArray()).toEqual(["urgent"]);
        } finally {
            f.provider.dispose();
        }
    });

    it("a Ctrl/Cmd drop merges concurrent adds from two clients instead of clobbering", async () => {
        const f = makeProject();
        const page = f.add("root", "Page");
        const key = f.add(page, "Card", ["base"]);

        const doc2 = new Y.Doc({ guid: `${f.projectDoc.guid}-mirror` });
        Y.applyUpdate(doc2, Y.encodeStateAsUpdate(f.projectDoc));
        const tree2 = new YTree(doc2.getMap("orderedTree"));
        const provider2 = new ItemsRelationProvider({ projectDoc: doc2, pgSchema: f.pgSchema });

        try {
            const e = entry({
                sourceKind: ITEMS_RELATION_NAME,
                sourceId: key,
                raw: { tags: JSON.stringify(["base"]) },
            });
            const resolver1 = { resolveRelation: async () => f.provider };
            const resolver2 = { resolveRelation: async () => provider2 };

            await writeCalendarLaneDrop(resolver1, e, "tags", "tags", "work", "add");
            await writeCalendarLaneDrop(resolver2, e, "tags", "tags", "urgent", "add");

            Y.applyUpdate(doc2, Y.encodeStateAsUpdate(f.projectDoc));
            Y.applyUpdate(f.projectDoc, Y.encodeStateAsUpdate(doc2));

            const value1 = f.tree.getNodeValueFromKey(key) as Y.Map<unknown>;
            const value2 = tree2.getNodeValueFromKey(key) as Y.Map<unknown>;
            expect(new Set((value1.get("tags") as Y.Array<string>).toArray())).toEqual(
                new Set(["base", "work", "urgent"]),
            );
            expect(new Set((value2.get("tags") as Y.Array<string>).toArray())).toEqual(
                new Set(["base", "work", "urgent"]),
            );
        } finally {
            f.provider.dispose();
            provider2.dispose();
        }
    });
});
