import { afterAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { YTree } from "yjs-orderedtree";
import { Items, Project } from "../../schema/app-schema";
import { ITEMS_RELATION_NAME, ItemsRelationProvider } from "./itemsRelation";
import { resetPgliteForTests, runSelect } from "./pgliteService";
import { RelationWriteError } from "./relationProvider";
import { projectSchemaName, quoteIdent } from "./sqlNames";

let counter = 0;

interface Fixture {
    projectDoc: Y.Doc;
    tree: YTree;
    pgSchema: string;
    provider: ItemsRelationProvider;
    add: (parentKey: string, text: string, due?: string, tags?: string[]) => string;
    rows: () => Promise<Record<string, unknown>[]>;
}

function makeProject(): Fixture {
    const projectDoc = new Y.Doc({ guid: `items-rel-tags-${counter++}` });
    const project = Project.fromDoc(projectDoc);
    const tree = project.tree;
    const pgSchema = projectSchemaName(projectDoc.guid);
    const provider = new ItemsRelationProvider({ projectDoc, pgSchema });

    const add = (parentKey: string, text: string, due?: string, tags?: string[]): string => {
        const item = new Items(projectDoc, tree, parentKey).addNode("tester");
        item.text = text;
        if (due !== undefined) item.due = due;
        if (tags) item.tags = tags;
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

describe("items relation tags projection", { timeout: 30000 }, () => {
    it("projects tags as a JSON-encoded array, and an untagged item as an empty array", async () => {
        const f = makeProject();
        const page = f.add("root", "Page");
        f.add(page, "Tagged", "2026-08-02T09:00:00Z", ["work", "urgent"]);
        f.add(page, "Untagged", "2026-08-03T09:00:00Z");

        expect(await f.provider.materialize()).toBe(true);
        try {
            const rows = await f.rows();
            const byText = Object.fromEntries(rows.map((r) => [r.text, r.tags]));
            expect(JSON.parse(byText.Tagged as string)).toEqual(["work", "urgent"]);
            expect(JSON.parse(byText.Untagged as string)).toEqual([]);
        } finally {
            f.provider.dispose();
        }
    });

    it("tracks tag edits incrementally", async () => {
        const f = makeProject();
        const page = f.add("root", "Page");
        const key = f.add(page, "Review", "2026-08-02T09:00:00Z", ["work"]);
        expect(await f.provider.materialize()).toBe(true);
        try {
            const value = f.tree.getNodeValueFromKey(key) as Y.Map<unknown>;
            (value.get("tags") as Y.Array<string>).push(["urgent"]);
            await settle();

            const rows = await f.rows();
            expect(JSON.parse(rows[0].tags as string)).toEqual(["work", "urgent"]);
        } finally {
            f.provider.dispose();
        }
    });

    it("writes the tag column through the relation, landing on the item's field", async () => {
        const f = makeProject();
        const page = f.add("root", "Page");
        const key = f.add(page, "Card", "2026-08-02T09:00:00Z", ["old"]);
        expect(await f.provider.materialize()).toBe(true);
        try {
            await f.provider.applyWrite({
                op: "UPDATE",
                rowId: key,
                column: "tags",
                value: JSON.stringify(["new", "shiny"]),
            });

            const value = f.tree.getNodeValueFromKey(key) as Y.Map<unknown>;
            const tagsArr = value.get("tags") as Y.Array<string>;
            expect(tagsArr.toArray()).toEqual(["new", "shiny"]);

            await settle();
            const rows = await f.rows();
            expect(JSON.parse(rows[0].tags as string)).toEqual(["new", "shiny"]);
        } finally {
            f.provider.dispose();
        }
    });

    it("clears tags when the relation writes an empty array", async () => {
        const f = makeProject();
        const page = f.add("root", "Page");
        const key = f.add(page, "Card", "2026-08-02T09:00:00Z", ["work"]);
        expect(await f.provider.materialize()).toBe(true);
        try {
            await f.provider.applyWrite({
                op: "UPDATE",
                rowId: key,
                column: "tags",
                value: JSON.stringify([]),
            });
            const value = f.tree.getNodeValueFromKey(key) as Y.Map<unknown>;
            expect(value.get("tags")).toBeUndefined();
        } finally {
            f.provider.dispose();
        }
    });

    it("refuses a malformed tags write rather than throwing", async () => {
        const f = makeProject();
        const page = f.add("root", "Page");
        const key = f.add(page, "Card", "2026-08-02T09:00:00Z", ["work"]);
        expect(await f.provider.materialize()).toBe(true);
        try {
            await f.provider.applyWrite({
                op: "UPDATE",
                rowId: key,
                column: "tags",
                value: "not json",
            });
            const value = f.tree.getNodeValueFromKey(key) as Y.Map<unknown>;
            // Unparseable input is treated as no tags, same as an empty array.
            expect(value.get("tags")).toBeUndefined();
        } finally {
            f.provider.dispose();
        }
    });

    it("still refuses a write for a column that maps to no node value field", async () => {
        const f = makeProject();
        const page = f.add("root", "Page");
        const key = f.add(page, "Review", "2026-08-02T09:00:00Z");
        expect(await f.provider.materialize()).toBe(true);
        try {
            await expect(
                f.provider.applyWrite({ op: "UPDATE", rowId: key, column: "parent_id", value: "x" }),
            ).rejects.toThrow(RelationWriteError);
        } finally {
            f.provider.dispose();
        }
    });
});
