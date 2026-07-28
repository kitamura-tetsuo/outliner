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
    /** Add an item under `parentKey`, optionally scheduled. */
    add: (parentKey: string, text: string, due?: string) => string;
    rows: () => Promise<Record<string, unknown>[]>;
}

/** A project doc with one page, and the items provider bound to it. */
function makeProject(): Fixture {
    const projectDoc = new Y.Doc({ guid: `items-rel-${counter++}` });
    const project = Project.fromDoc(projectDoc);
    const tree = project.tree;
    const pgSchema = projectSchemaName(projectDoc.guid);
    const provider = new ItemsRelationProvider({ projectDoc, pgSchema });

    const add = (parentKey: string, text: string, due?: string): string => {
        const item = new Items(projectDoc, tree, parentKey).addNode("tester");
        item.text = text;
        if (due !== undefined) item.due = due;
        return item.key;
    };

    const rows = async () =>
        (await runSelect(
            `SELECT * FROM ${quoteIdent(pgSchema)}.${quoteIdent(ITEMS_RELATION_NAME)} ORDER BY "text"`,
        )).rows as Record<string, unknown>[];

    return { projectDoc, tree, pgSchema, provider, add, rows };
}

/** Let the observer's microtask flush reach PGlite. */
function settle(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 20));
}

afterAll(async () => {
    await resetPgliteForTests();
});

// The first test pays PGlite's cold-start cost.
describe("items relation projection", { timeout: 30000 }, () => {
    it("projects only the items that carry a date", async () => {
        const f = makeProject();
        const page = f.add("root", "Page");
        f.add(page, "Scheduled", "2026-08-01T09:00:00Z");
        f.add(page, "Just a note");

        expect(await f.provider.materialize()).toBe(true);
        try {
            const rows = await f.rows();
            expect(rows.map((r) => r.text)).toEqual(["Scheduled"]);
            expect(rows[0].page_id).toBe(page);
            expect(rows[0].parent_id).toBe(page);
            expect(rows[0].done).toBe(false);
        } finally {
            f.provider.dispose();
        }
    });

    it("adds, updates and removes rows incrementally as `due` changes", async () => {
        const f = makeProject();
        const page = f.add("root", "Page");
        expect(await f.provider.materialize()).toBe(true);
        try {
            expect(await f.rows()).toHaveLength(0);

            // Adding a date brings the item into the relation...
            const key = f.add(page, "Review", "2026-08-01T09:00:00Z");
            await settle();
            expect(await f.rows()).toHaveLength(1);

            // ...editing it moves the row...
            const value = f.tree.getNodeValueFromKey(key) as Y.Map<unknown>;
            value.set("due", "2026-09-15T09:00:00Z");
            await settle();
            expect((await f.rows())[0].due).toEqual(new Date("2026-09-15T09:00:00Z"));

            // ...and removing it takes the row out again.
            value.delete("due");
            await settle();
            expect(await f.rows()).toHaveLength(0);
        } finally {
            f.provider.dispose();
        }
    });

    it("leaves the relation untouched when an edit does not concern `due`", async () => {
        const f = makeProject();
        const page = f.add("root", "Page");
        const key = f.add(page, "Review", "2026-08-01T09:00:00Z");
        f.add(page, "Unscheduled note");
        expect(await f.provider.materialize()).toBe(true);
        try {
            const value = f.tree.getNodeValueFromKey(key) as Y.Map<unknown>;
            (value.get("text") as Y.Text).insert(0, "Careful ");
            await settle();

            const rows = await f.rows();
            expect(rows).toHaveLength(1);
            // The row still tracks the item: its title followed the edit.
            expect(rows[0].text).toBe("Careful Review");
        } finally {
            f.provider.dispose();
        }
    });

    it("drops the rows of a deleted item and its scheduled descendants", async () => {
        const f = makeProject();
        const page = f.add("root", "Page");
        const parent = f.add(page, "Sprint", "2026-08-01T09:00:00Z");
        f.add(parent, "Subtask", "2026-08-02T09:00:00Z");
        expect(await f.provider.materialize()).toBe(true);
        try {
            expect(await f.rows()).toHaveLength(2);
            f.tree.deleteNodeAndDescendants(parent);
            await settle();
            expect(await f.rows()).toHaveLength(0);
        } finally {
            f.provider.dispose();
        }
    });

    it("refuses a write for a column that maps to no node value field", async () => {
        const f = makeProject();
        const page = f.add("root", "Page");
        const key = f.add(page, "Review", "2026-08-01T09:00:00Z");
        expect(await f.provider.materialize()).toBe(true);
        try {
            await expect(
                f.provider.applyWrite({ op: "UPDATE", rowId: key, column: "page_id", value: "x" }),
            ).rejects.toThrow(RelationWriteError);
        } finally {
            f.provider.dispose();
        }
    });
});
