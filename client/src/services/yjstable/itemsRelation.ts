// The `outline_items` relation: outline items projected into the project's Postgres
// schema so a calendar can read items and generated table rows with one query.
//
// Three things make this relation different from a table:
//
//   1. Scope. Only items carrying `due` are projected. Projecting every item
//      of every page does not scale, and it matches the user-facing rule:
//      give an item a date and it appears on the calendar.
//   2. Incremental maintenance. Items live across the page structure
//      (`YTree`), not in one subdoc's Data Storage, so the projection is
//      maintained by diffed upserts from `observeDeep`, never by full rebuild.
//   3. Write-back. An UPDATE writes the mapped field of the item's node value
//      (the drag-to-reschedule path). Nothing is written to PGlite by anyone
//      but this provider, reading Yjs as the single source of truth.
//
// The tree's Y.Map is shaped `nodeKey -> { value: Y.Map, _parentHistory }`
// (see yjs-orderedtree), so a deep event's `path[0]` is always the node key
// whose projection may have changed.

import type { PGlite } from "@electric-sql/pglite";
import * as Y from "yjs";
import { YTree } from "yjs-orderedtree";
import { getLogger } from "../../lib/logger";
import { Items } from "../../schema/app-schema";
import { enqueueWrite } from "./pgliteService";
import {
    assertWriteAllowed,
    ITEMS_RELATION_CAPABILITIES,
    type RelationCapabilities,
    type RelationProvider,
    type RelationValue,
    type RelationWrite,
    RelationWriteError,
} from "./relationProvider";
import { quoteIdent } from "./sqlNames";

const logger = getLogger("itemsRelation");

/**
 * Reserved SQL name of the projection. See `RESERVED_RELATION_NAMES`.
 *
 * Deliberately not the bare `items`: that is a name users reach for when they
 * name a table of their own, and a reserved word should cost them as little as
 * possible. The prefix says whose relation it is.
 */
export const ITEMS_RELATION_NAME = "outline_items";

/** Origin of every write-back, so the observer ignores its own echo. */
export const ITEMS_RELATION_ORIGIN = Symbol("items-relation-origin");

/** The Y.Map holding the outline tree inside a project doc. */
export const ORDERED_TREE_KEY = "orderedTree";

/** Node value field that decides whether an item is projected at all. */
const DUE_FIELD = "due";

/**
 * Columns of the projection, and the node value field each maps back to.
 * `id` is the item's tree key: it is what `applyWrite` addresses a row by, and
 * unlike the item's `id` field it is guaranteed present and unique.
 */
const COLUMN_TO_FIELD: Record<string, string> = {
    text: "text",
    due: DUE_FIELD,
    done: "done",
    tags: "tags",
};

export const ITEMS_RELATION_COLUMNS = [
    "id",
    "page_id",
    "parent_id",
    "text",
    "due",
    "done",
    "tags",
] as const;

function createTableSql(): string {
    return `CREATE TABLE ${quoteIdent(ITEMS_RELATION_NAME)} (
        "id" TEXT PRIMARY KEY,
        "page_id" TEXT,
        "parent_id" TEXT,
        "text" TEXT,
        "due" TIMESTAMPTZ,
        "done" BOOLEAN,
        "tags" TEXT
    )`;
}

interface ProjectedRow {
    id: string;
    page_id: string | undefined;
    parent_id: string | undefined;
    text: string;
    due: string;
    done: boolean;
    /** JSON-encoded array of tag strings — see §4.7 of the CRDT/SQL ADR. */
    tags: string;
}

export interface ItemsRelationOptions {
    projectDoc: Y.Doc;
    /** Shared Postgres schema holding every relation of the project. */
    pgSchema: string;
}

export class ItemsRelationProvider implements RelationProvider {
    readonly capabilities: RelationCapabilities = ITEMS_RELATION_CAPABILITIES;

    private readonly projectDoc: Y.Doc;
    private readonly pgSchema: string;
    private readonly treeMap: Y.Map<unknown>;
    private readonly tree: YTree;
    private materialized = false;
    private disposed = false;
    private started = false;
    private pendingKeys = new Set<string>();
    private flushScheduled = false;
    private flushing: Promise<void> = Promise.resolve();

    private readonly treeObserver = (
        events: Y.YEvent<Y.AbstractType<unknown>>[],
        tr: Y.Transaction,
    ) => {
        // Our own write-back is applied to the projection by `applyWrite`
        // itself, from the Yjs state it just wrote. Re-entering here would
        // treat it as a foreign change and redo the same work.
        if (tr.origin === ITEMS_RELATION_ORIGIN) return;
        for (const event of events) {
            if (event.path.length === 0) {
                // Nodes added to or removed from the tree.
                for (const key of event.changes.keys.keys()) this.markDirty(key);
            } else {
                const key = String(event.path[0]);
                // A reparent moves the whole subtree, so page_id/parent_id of
                // every descendant changes with it.
                if (event.path.length > 1 && event.path[1] === "_parentHistory") {
                    this.markSubtreeDirty(key);
                } else {
                    this.markDirty(key);
                }
            }
        }
        this.scheduleFlush();
    };

    constructor(options: ItemsRelationOptions) {
        this.projectDoc = options.projectDoc;
        this.pgSchema = options.pgSchema;
        this.treeMap = options.projectDoc.getMap(ORDERED_TREE_KEY);
        this.tree = new YTree(this.treeMap);
    }

    get sqlName(): string {
        return this.materialized ? ITEMS_RELATION_NAME : "";
    }

    /**
     * Build the relation and seed it with every item that currently carries a
     * date. This is the only full pass: from here the projection is maintained
     * incrementally by `treeObserver`.
     */
    async materialize(): Promise<boolean> {
        if (this.disposed) return false;
        if (this.materialized) return true;

        const rows = this.collectProjectedRows();
        try {
            await enqueueWrite(async (db) => {
                await db.exec(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(this.pgSchema)};`);
                await db.exec(`DROP TABLE IF EXISTS ${this.qualifiedName()} CASCADE;`);
                await db.exec(
                    `BEGIN; SET LOCAL search_path TO ${quoteIdent(this.pgSchema)}; ${createTableSql()}; COMMIT;`,
                );
                for (const row of rows) await this.insertRow(db, row);
            });
        } catch (err) {
            logger.warn({ err }, "[itemsRelation] materializing the items projection failed");
            return false;
        }
        if (this.disposed) return false;

        this.materialized = true;
        if (!this.started) {
            this.started = true;
            this.treeMap.observeDeep(this.treeObserver);
        }
        return true;
    }

    dispose(): void {
        this.disposed = true;
        this.materialized = false;
        if (this.started) {
            this.treeMap.unobserveDeep(this.treeObserver);
            this.started = false;
        }
    }

    // ------------------------------------------------------------------
    // Write-back
    // ------------------------------------------------------------------

    /**
     * Apply a write to the owning item. Every mutation runs under
     * `ITEMS_RELATION_ORIGIN` so the observer skips the echo; the rows the
     * write touched are projected from the resulting Yjs state instead.
     */
    async applyWrite(write: RelationWrite): Promise<void> {
        assertWriteAllowed(this.capabilities, write, ITEMS_RELATION_NAME);
        const touched: string[] = [];

        this.projectDoc.transact(() => {
            switch (write.op) {
                case "UPDATE": {
                    this.writeField(write.rowId, write.column, write.value);
                    touched.push(write.rowId);
                    return;
                }
                case "INSERT": {
                    const parentKey = write.destination!.parentKey;
                    if (!this.hasNode(parentKey)) {
                        throw new RelationWriteError(
                            `INSERT destination "${parentKey}" does not exist in this project`,
                        );
                    }
                    const item = new Items(this.projectDoc, this.tree, parentKey).addNode("");
                    for (const [column, value] of Object.entries(write.values)) {
                        if (column === "id") continue;
                        this.writeField(item.key, column, value);
                    }
                    touched.push(item.key);
                    return;
                }
                case "DELETE": {
                    if (write.disposition === "delete-source") {
                        // Descendants go with the item; each of them may have
                        // been projected too.
                        touched.push(...this.subtreeKeys(write.rowId));
                        this.tree.deleteNodeAndDescendants(write.rowId);
                    } else {
                        this.writeField(write.rowId, "due", null);
                        touched.push(write.rowId);
                    }
                    return;
                }
            }
        }, ITEMS_RELATION_ORIGIN);

        for (const key of touched) this.pendingKeys.add(key);
        await this.flushPending();
    }

    /** Write one relation column into the item's node value. */
    private writeField(itemKey: string, column: string, value: RelationValue): void {
        const field = COLUMN_TO_FIELD[column];
        if (!field) {
            throw new RelationWriteError(
                `Column "${column}" of the items relation is not writable`,
            );
        }
        const nodeValue = this.nodeValue(itemKey);
        if (!nodeValue) {
            throw new RelationWriteError(`Item "${itemKey}" does not exist in this project`);
        }
        if (field === "text") {
            const text = nodeValue.get("text");
            const next = value === null || value === undefined ? "" : String(value);
            if (text instanceof Y.Text) {
                text.delete(0, text.length);
                if (next) text.insert(0, next);
            } else {
                const created = new Y.Text();
                if (next) created.insert(0, next);
                nodeValue.set("text", created);
            }
            return;
        }
        if (field === "tags") {
            this.writeTags(nodeValue, value);
            return;
        }
        // Absent means "not scheduled"/"not done": null clears the field
        // rather than storing a null the accessors would have to special-case.
        if (value === null || value === undefined || value === "") {
            nodeValue.delete(field);
            return;
        }
        nodeValue.set(field, field === "done" ? this.toBoolean(value) : String(value));
    }

    /** Replace the item's tag set from the relation's JSON-encoded value. */
    private writeTags(nodeValue: Y.Map<unknown>, value: RelationValue): void {
        const next = this.parseTagsValue(value);
        const existing = nodeValue.get("tags") as Y.Array<string> | undefined;
        if (next.length === 0) {
            if (existing) nodeValue.delete("tags");
            return;
        }
        const arr = existing ?? new Y.Array<string>();
        if (!existing) nodeValue.set("tags", arr);
        else if (arr.length > 0) arr.delete(0, arr.length);
        arr.push(next);
    }

    private parseTagsValue(value: RelationValue): string[] {
        if (typeof value !== "string" || value.trim() === "") return [];
        try {
            const parsed: unknown = JSON.parse(value);
            if (!Array.isArray(parsed)) return [];
            return Array.from(
                new Set(
                    parsed
                        .filter((t): t is string => typeof t === "string")
                        .map((t) => t.trim())
                        .filter((t) => t !== ""),
                ),
            );
        } catch {
            return [];
        }
    }

    private toBoolean(value: RelationValue): boolean {
        if (typeof value === "boolean") return value;
        if (value === "true") return true;
        if (value === "false") return false;
        return Boolean(value);
    }

    // ------------------------------------------------------------------
    // Incremental projection
    // ------------------------------------------------------------------

    private markDirty(key: string): void {
        this.pendingKeys.add(key);
    }

    private markSubtreeDirty(key: string): void {
        for (const descendant of this.subtreeKeys(key)) this.pendingKeys.add(descendant);
    }

    private scheduleFlush(): void {
        if (this.flushScheduled) return;
        this.flushScheduled = true;
        queueMicrotask(() => {
            this.flushScheduled = false;
            if (this.disposed || !this.materialized) return;
            void this.flushPending();
        });
    }

    /**
     * Apply the pending keys to PGlite. Serialized so two flushes cannot
     * interleave their upserts for the same key.
     */
    private flushPending(): Promise<void> {
        this.flushing = this.flushing.then(async () => {
            if (this.disposed || !this.materialized) return;
            const keys = [...this.pendingKeys];
            this.pendingKeys.clear();
            if (keys.length === 0) return;
            try {
                await enqueueWrite(async (db) => {
                    for (const key of keys) await this.applyKeyToDb(db, key);
                });
            } catch (err) {
                logger.warn({ err }, "[itemsRelation] applying an item change failed");
            }
        }).catch(() => undefined);
        return this.flushing;
    }

    /** Upsert one item, or delete its row when it is no longer projected. */
    private async applyKeyToDb(db: PGlite, key: string): Promise<void> {
        const row = this.projectRow(key);
        if (!row) {
            await db.query(`DELETE FROM ${this.qualifiedName()} WHERE "id" = $1`, [key]);
            return;
        }
        await this.insertRow(db, row);
    }

    private async insertRow(db: PGlite, row: ProjectedRow): Promise<void> {
        try {
            await db.query(
                `INSERT INTO ${this.qualifiedName()} ("id", "page_id", "parent_id", "text", "due", "done", "tags")
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 ON CONFLICT ("id") DO UPDATE SET
                     "page_id" = EXCLUDED."page_id",
                     "parent_id" = EXCLUDED."parent_id",
                     "text" = EXCLUDED."text",
                     "due" = EXCLUDED."due",
                     "done" = EXCLUDED."done",
                     "tags" = EXCLUDED."tags"`,
                [
                    row.id,
                    row.page_id ?? null,
                    row.parent_id ?? null,
                    row.text,
                    row.due,
                    row.done,
                    row.tags,
                ],
            );
        } catch (err) {
            // An unparseable date is one item's problem: the rest of the
            // calendar keeps working, and the row simply stays out of it.
            logger.warn({ err, itemKey: row.id }, "[itemsRelation] projecting an item failed");
            await db.query(`DELETE FROM ${this.qualifiedName()} WHERE "id" = $1`, [row.id])
                .catch(() => undefined);
        }
    }

    private qualifiedName(): string {
        return `${quoteIdent(this.pgSchema)}.${quoteIdent(ITEMS_RELATION_NAME)}`;
    }

    // ------------------------------------------------------------------
    // Reading the tree
    // ------------------------------------------------------------------

    /**
     * `hasNode` is missing from the installed yjs-orderedtree, so existence is
     * checked the way the schema wrappers do it — the computed map first, the
     * lookup itself as the fallback.
     */
    private hasNode(key: string): boolean {
        if (typeof this.tree.hasNode === "function") return this.tree.hasNode(key);
        return this.tree.computedMap?.has(key) ?? this.treeMap.has(key);
    }

    private nodeValue(key: string): Y.Map<unknown> | undefined {
        try {
            if (!this.hasNode(key)) return undefined;
            const value = this.tree.getNodeValueFromKey(key);
            return value instanceof Y.Map ? (value as Y.Map<unknown>) : undefined;
        } catch {
            return undefined;
        }
    }

    /** The row for an item, or undefined when it is not projected. */
    private projectRow(key: string): ProjectedRow | undefined {
        const value = this.nodeValue(key);
        if (!value) return undefined;
        const due = value.get(DUE_FIELD);
        if (typeof due !== "string" || due.trim() === "") return undefined;

        const text = value.get("text");
        const parentKey = this.parentOf(key);
        const tagsArr = value.get("tags");
        return {
            id: key,
            // Pages are the top-level items, so the page of an item is the
            // ancestor whose own parent is the tree root.
            page_id: this.pageKeyOf(key),
            parent_id: parentKey === "root" ? undefined : parentKey,
            text: text instanceof Y.Text ? text.toString() : String(text ?? ""),
            due: due.trim(),
            done: value.get("done") === true,
            tags: JSON.stringify(tagsArr instanceof Y.Array ? tagsArr.toArray() : []),
        };
    }

    private parentOf(key: string): string | undefined {
        try {
            return this.tree.getNodeParentFromKey(key);
        } catch {
            return undefined;
        }
    }

    private pageKeyOf(key: string): string | undefined {
        let current: string | undefined = key;
        // The tree is shallow in practice; the bound only guards against a
        // cycle introduced by a malformed parent history.
        for (let depth = 0; current && depth < 1000; depth++) {
            const parent = this.parentOf(current);
            if (parent === undefined) return undefined;
            if (parent === "root") return current === key ? undefined : current;
            current = parent;
        }
        return undefined;
    }

    private subtreeKeys(key: string): string[] {
        const collected: string[] = [];
        const queue = [key];
        while (queue.length > 0) {
            const current = queue.pop()!;
            collected.push(current);
            try {
                queue.push(...this.tree.getNodeChildrenFromKey(current));
            } catch {
                // node already gone
            }
        }
        return collected;
    }

    private collectProjectedRows(): ProjectedRow[] {
        const rows: ProjectedRow[] = [];
        this.treeMap.forEach((_node, key) => {
            if (key === "root") return;
            const row = this.projectRow(key);
            if (row) rows.push(row);
        });
        return rows;
    }
}
