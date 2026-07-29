import { afterAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Item, Items, Project } from "../../schema/app-schema";
import { ITEMS_RELATION_NAME, ITEMS_RELATION_ORIGIN, ItemsRelationProvider } from "./itemsRelation";
import { resetPgliteForTests, runSelect } from "./pgliteService";
import { RelationWriteError } from "./relationProvider";
import { projectSchemaName, quoteIdent } from "./sqlNames";

let counter = 0;

/** A project doc with one page holding one scheduled item. */
function makeScheduledItem() {
    const projectDoc = new Y.Doc({ guid: `items-write-${counter++}` });
    const tree = Project.fromDoc(projectDoc).tree;
    const pgSchema = projectSchemaName(projectDoc.guid);
    const provider = new ItemsRelationProvider({ projectDoc, pgSchema });

    const page = new Items(projectDoc, tree, "root").addNode("tester");
    page.text = "Page";
    const item = new Items(projectDoc, tree, page.key).addNode("tester");
    item.text = "Review";
    item.due = "2026-08-01T09:00:00Z";

    const rows = async () =>
        (await runSelect(
            `SELECT * FROM ${quoteIdent(pgSchema)}.${quoteIdent(ITEMS_RELATION_NAME)}`,
        )).rows as Record<string, unknown>[];

    return { projectDoc, tree, provider, page, item, rows };
}

afterAll(async () => {
    await resetPgliteForTests();
});

// The first test pays PGlite's cold-start cost.
describe("items relation write-back", { timeout: 30000 }, () => {
    it("writes an UPDATE into the item's node value, not into PGlite directly", async () => {
        const f = makeScheduledItem();
        expect(await f.provider.materialize()).toBe(true);
        try {
            await f.provider.applyWrite({
                op: "UPDATE",
                rowId: f.item.key,
                column: "due",
                value: "2026-09-15T09:00:00Z",
            });

            // Yjs is the source of truth...
            expect(f.item.due).toBe("2026-09-15T09:00:00Z");
            // ...and the item's text is untouched by a reschedule.
            expect(f.item.text).toBe("Review");
            // ...and the projection followed it.
            const rows = await f.rows();
            expect(rows).toHaveLength(1);
            expect(rows[0].due).toEqual(new Date("2026-09-15T09:00:00Z"));
        } finally {
            f.provider.dispose();
        }
    });

    it("carries the relation's origin so the write does not re-enter as a foreign change", async () => {
        const f = makeScheduledItem();
        expect(await f.provider.materialize()).toBe(true);
        const origins: unknown[] = [];
        const listener = (tr: Y.Transaction) => origins.push(tr.origin);
        f.projectDoc.on("afterTransaction", listener);
        try {
            await f.provider.applyWrite({
                op: "UPDATE",
                rowId: f.item.key,
                column: "done",
                value: true,
            });
            expect(origins).toContain(ITEMS_RELATION_ORIGIN);
            expect(origins.every((o) => o === ITEMS_RELATION_ORIGIN)).toBe(true);
            // The projection is still current even though the observer skipped
            // the echo: the provider applied the rows it just wrote.
            expect((await f.rows())[0].done).toBe(true);
        } finally {
            f.projectDoc.off("afterTransaction", listener);
            f.provider.dispose();
        }
    });

    it("makes an UPDATE observable on a second client", async () => {
        const f = makeScheduledItem();
        const other = new Y.Doc();
        // Seed the replica before wrapping it: a YTree must be built on a map
        // that is either empty or already a tree, as it is after initial sync.
        Y.applyUpdate(other, Y.encodeStateAsUpdate(f.projectDoc));
        const otherTree = Project.fromDoc(other).tree;
        const relay = (update: Uint8Array) => Y.applyUpdate(other, update);
        f.projectDoc.on("update", relay);
        expect(await f.provider.materialize()).toBe(true);
        try {
            await f.provider.applyWrite({
                op: "UPDATE",
                rowId: f.item.key,
                column: "due",
                value: "2026-10-05T09:00:00Z",
            });
            expect(new Item(other, otherTree, f.item.key).due).toBe("2026-10-05T09:00:00Z");
        } finally {
            f.projectDoc.off("update", relay);
            f.provider.dispose();
        }
    });

    it("creates an INSERT only under the destination the caller chose", async () => {
        const f = makeScheduledItem();
        expect(await f.provider.materialize()).toBe(true);
        try {
            await expect(
                f.provider.applyWrite({ op: "INSERT", values: { due: "2026-08-03T09:00:00Z" } }),
            ).rejects.toThrow(/explicit destination/);
            await expect(
                f.provider.applyWrite({
                    op: "INSERT",
                    values: { due: "2026-08-03T09:00:00Z" },
                    destination: { parentKey: "no-such-item" },
                }),
            ).rejects.toThrow(RelationWriteError);

            await f.provider.applyWrite({
                op: "INSERT",
                values: { text: "Plan", due: "2026-08-03T09:00:00Z" },
                destination: { parentKey: f.page.key },
            });

            const created = [...new Items(f.projectDoc, f.tree, f.page.key)]
                .find((child) => child.text === "Plan");
            expect(created?.due).toBe("2026-08-03T09:00:00Z");
            const rows = await f.rows();
            expect(rows).toHaveLength(2);
            expect(rows.find((r) => r.text === "Plan")?.parent_id).toBe(f.page.key);
        } finally {
            f.provider.dispose();
        }
    });

    it("requires an explicit choice on DELETE and honours both dispositions", async () => {
        const f = makeScheduledItem();
        expect(await f.provider.materialize()).toBe(true);
        try {
            await expect(
                f.provider.applyWrite({ op: "DELETE", rowId: f.item.key }),
            ).rejects.toThrow(/deleting the item and clearing its date/);

            // Clearing the date takes the item off the calendar, keeps the item.
            await f.provider.applyWrite({
                op: "DELETE",
                rowId: f.item.key,
                disposition: "clear-projected-field",
            });
            expect(await f.rows()).toHaveLength(0);
            expect(f.item.due).toBeUndefined();
            expect(f.item.text).toBe("Review");

            // Deleting the item removes it from the outline as well.
            f.item.due = "2026-08-01T09:00:00Z";
            await new Promise((resolve) => setTimeout(resolve, 20));
            expect(await f.rows()).toHaveLength(1);

            await f.provider.applyWrite({
                op: "DELETE",
                rowId: f.item.key,
                disposition: "delete-source",
            });
            expect(await f.rows()).toHaveLength(0);
            expect([...new Items(f.projectDoc, f.tree, f.page.key)]).toHaveLength(0);
        } finally {
            f.provider.dispose();
        }
    });
});
