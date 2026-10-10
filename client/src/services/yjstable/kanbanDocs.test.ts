// Kanban definition persistence (issue #5541): production-path coverage for
// creation, reads, validation, deletion and consumer lifetime. Every test
// starts at the production operations in `./kanbanDocs` on actual Yjs
// documents — never by hand-building the internal registry map.

import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { globalUndoRouter } from "../undo/undoRouter.svelte";
import { createGrid, getGridHandles, getGridQuery, GRID_REGISTRY_KEY, listGrids } from "./gridDocs";
import {
    createKanban,
    destroyKanbanUndoManager,
    findKanbansBySourceTable,
    getKanban,
    getKanbanHandles,
    getKanbanName,
    getKanbanRegistry,
    getKanbanSourceTableId,
    KANBAN_REGISTRY_KEY,
    listKanbans,
    observeKanbans,
    removeKanban,
    retainKanbanUndoManager,
    updateKanban,
} from "./kanbanDocs";
import { addRecord, createTable, getTableHandles, listTables, removeTable } from "./tableDocs";

const SCHEMA_SQL = "CREATE TABLE tasks (id TEXT, status TEXT, title TEXT)";

function tasksProject(): { doc: Y.Doc; tableId: string; } {
    const doc = new Y.Doc();
    const tableId = createTable(doc, "Tasks", "tasks", (handles) => {
        handles.schemaText.insert(0, SCHEMA_SQL);
    });
    const table = getTableHandles(doc, tableId)!;
    addRecord(table, { id: "row-1", status: "open", title: "First" });
    addRecord(table, { id: "row-2", status: "done", title: "Second" });
    return { doc, tableId };
}

describe("Kanban creation over an existing Table", () => {
    it("creates two independently identified boards over one Table without copying data", () => {
        const { doc, tableId } = tasksProject();
        const gridId = createGrid(doc, tableId, { name: "Tasks grid", query: "SELECT id FROM tasks" });
        const recordsBefore = getTableHandles(doc, tableId)!.data.size;

        const first = createKanban(doc, tableId, {
            name: "Board",
            query: "SELECT id, status FROM tasks",
            groupField: "status",
            titleField: "id",
            detailFields: ["status"],
            laneOrder: ["open"],
        });
        const second = createKanban(doc, tableId, {
            name: "Board",
            query: "SELECT id FROM tasks",
            titleField: "id",
        });

        // Same display name, distinct identities, one shared source.
        expect(first).not.toBe(second);
        expect(getKanbanSourceTableId(doc, first)).toBe(tableId);
        expect(getKanbanSourceTableId(doc, second)).toBe(tableId);
        expect(getKanbanName(doc, first)).toBe("Board");
        expect(listKanbans(doc).map(k => k.kanbanId).sort()).toEqual([first, second].sort());
        expect(findKanbansBySourceTable(doc, tableId)).toHaveLength(2);

        // Updating one board leaves the other board and the Grid untouched.
        updateKanban(doc, first, { query: "SELECT id FROM tasks WHERE status = 'open'" });
        expect(getKanban(doc, second)?.query).toBe("SELECT id FROM tasks");
        expect(getGridQuery(getGridHandles(doc, gridId)!)).toBe("SELECT id FROM tasks");

        // Creation added neither copied data nor placements.
        expect(listTables(doc)).toHaveLength(1);
        expect(listGrids(doc)).toHaveLength(1);
        expect(getTableHandles(doc, tableId)!.data.size).toBe(recordsBefore);
        expect(getTableHandles(doc, tableId)!.schemaText.toString()).toBe(SCHEMA_SQL);
        expect(doc.getMap("orderedTree").size).toBe(0);

        for (const entry of [getKanbanRegistry(doc).get(first)!, getKanbanRegistry(doc).get(second)!]) {
            const keys = Array.from(entry.keys()).sort();
            expect(keys).toEqual(Array.from(new Set(keys)));
            for (const key of keys) {
                expect(
                    ["sourceTableId", "name", "query", "groupField", "titleField", "detailFields", "laneOrder"],
                ).toContain(key);
            }
        }
        expect(doc.getMap(KANBAN_REGISTRY_KEY).size).toBe(2);
    });

    it("reads back the exact stored settings, including order", () => {
        const { doc, tableId } = tasksProject();
        const kanbanId = createKanban(doc, tableId, {
            name: "Sprint",
            query: "SELECT id, status, title FROM tasks ORDER BY id",
            groupField: "status",
            titleField: "title",
            detailFields: ["title", "status"],
            laneOrder: ["open", "done"],
        });

        expect(getKanban(doc, kanbanId)).toEqual({
            name: "Sprint",
            sourceTableId: tableId,
            query: "SELECT id, status, title FROM tasks ORDER BY id",
            groupField: "status",
            titleField: "title",
            detailFields: ["title", "status"],
            laneOrder: ["open", "done"],
        });
    });

    it("stores an empty query and absent roles as incomplete configuration", () => {
        const { doc, tableId } = tasksProject();
        const kanbanId = createKanban(doc, tableId, { name: "Draft", query: "" });

        expect(getKanban(doc, kanbanId)).toEqual({
            name: "Draft",
            sourceTableId: tableId,
            query: "",
            detailFields: [],
            laneOrder: [],
        });

        updateKanban(doc, kanbanId, { titleField: "title" });
        expect(getKanban(doc, kanbanId)?.titleField).toBe("title");
        updateKanban(doc, kanbanId, { titleField: "" });
        expect(getKanban(doc, kanbanId)?.titleField).toBeUndefined();
    });

    it("leaves a dangling source reference unrepaired on reads", () => {
        const { doc, tableId } = tasksProject();
        const kanbanId = createKanban(doc, tableId, { name: "Board" });
        expect(removeTable(doc, tableId)).toBe(true);

        // Reads report the stored reference as-is; nothing is substituted or pruned.
        expect(getKanban(doc, kanbanId)?.sourceTableId).toBe(tableId);
        expect(listKanbans(doc)).toHaveLength(1);
        expect(getKanbanHandles(doc, kanbanId)).toBeDefined();
    });
});

describe("Kanban reconstruction through document persistence", () => {
    it("restores the exact definition without replaying creation", () => {
        const { doc, tableId } = tasksProject();
        const query = 'SELECT "weird ""col""",\n  title AS "Title"  FROM tasks   WHERE status = \'open\'  ORDER BY 1';
        const kanbanId = createKanban(doc, tableId, {
            name: "Exact",
            query,
            groupField: "status",
            titleField: "Title",
            detailFields: ["Title", "status"],
            laneOrder: ["", "NULL", null, "open"],
        });

        const bytes = Y.encodeStateAsUpdate(doc);
        const restarted = new Y.Doc();
        Y.applyUpdate(restarted, bytes);

        // The same identity, source reference and exact settings are
        // available on a document that never ran the creator.
        expect(getKanban(restarted, kanbanId)).toEqual({
            name: "Exact",
            sourceTableId: tableId,
            query,
            groupField: "status",
            titleField: "Title",
            detailFields: ["Title", "status"],
            laneOrder: ["", "NULL", null, "open"],
        });
        // SQL NULL stays distinct from every string through persistence.
        const lanes = getKanban(restarted, kanbanId)!.laneOrder;
        expect(lanes[2]).toBeNull();
        expect(lanes[0]).toBe("");
        expect(lanes[1]).toBe("NULL");
    });
});

describe("Kanban validation and missing identities", () => {
    it("rejects creation against a missing or foreign Table before partial changes", () => {
        const { doc } = tasksProject();
        const foreign = new Y.Doc();
        const foreignTable = createTable(foreign, "Other", "other");

        expect(() => createKanban(doc, "missing-table", { name: "Board" })).toThrow(/does not exist/);
        expect(() => createKanban(doc, foreignTable, { name: "Board" })).toThrow(/does not exist/);
        expect(() => createKanban(doc, "", { name: "Board" })).toThrow(/non-empty/);
        expect(listKanbans(doc)).toEqual([]);
    });

    it("rejects duplicate or mistyped settings without changing the stored definition", () => {
        const { doc, tableId } = tasksProject();
        const kanbanId = createKanban(doc, tableId, {
            name: "Board",
            query: "SELECT id FROM tasks",
            detailFields: ["title"],
            laneOrder: ["open"],
        });
        const before = getKanban(doc, kanbanId);

        expect(() => createKanban(doc, tableId, { name: "Dup", detailFields: ["a", "a"] })).toThrow(/Duplicate/);
        expect(() => createKanban(doc, tableId, { name: "Dup", laneOrder: ["a", "a"] })).toThrow(/Duplicate/);
        expect(() => createKanban(doc, tableId, { name: "Dup", laneOrder: [null, null] })).toThrow(/Duplicate/);
        expect(() => createKanban(doc, tableId, { name: "Dup", laneOrder: [42 as unknown as string] })).toThrow(
            /laneOrder/,
        );
        expect(listKanbans(doc)).toHaveLength(1);

        // A structurally invalid multi-setting update fails before partial changes.
        expect(() => updateKanban(doc, kanbanId, { name: "Renamed", detailFields: ["a", "a"] })).toThrow(/Duplicate/);
        expect(() => updateKanban(doc, kanbanId, { query: "SELECT 2", laneOrder: [null, null] })).toThrow(/Duplicate/);
        expect(getKanban(doc, kanbanId)).toEqual(before);
    });

    it("reports a missing target instead of recreating it, and never falls back to a Grid", () => {
        const { doc, tableId } = tasksProject();
        const kanbanId = createKanban(doc, tableId, { name: "Board" });
        const gridsBefore = doc.getMap(GRID_REGISTRY_KEY).size;

        expect(removeKanban(doc, kanbanId)).toBe(true);
        expect(removeKanban(doc, kanbanId)).toBe(false);
        expect(getKanban(doc, kanbanId)).toBeUndefined();
        expect(getKanbanHandles(doc, kanbanId)).toBeUndefined();
        expect(getKanbanName(doc, kanbanId)).toBeUndefined();
        expect(getKanbanSourceTableId(doc, kanbanId)).toBeUndefined();
        expect(listKanbans(doc)).toEqual([]);
        expect(() => updateKanban(doc, kanbanId, { name: "Ghost" })).toThrow(/not found/);
        expect(() => updateKanban(doc, "missing-id", { name: "Ghost" })).toThrow(/not found/);

        // No new definition or fallback Grid appears; the source Table is unchanged.
        expect(listKanbans(doc)).toEqual([]);
        expect(doc.getMap(GRID_REGISTRY_KEY).size).toBe(gridsBefore);
        expect(listTables(doc)).toHaveLength(1);
        expect(getTableHandles(doc, tableId)!.data.size).toBe(2);
    });

    it("resolving an absent identity performs no repair", () => {
        const { doc } = tasksProject();
        let notifications = 0;
        const unsubscribe = observeKanbans(doc, () => notifications++);

        expect(getKanban(doc, "absent")).toBeUndefined();
        expect(getKanbanHandles(doc, "absent")).toBeUndefined();
        expect(notifications).toBe(0);
        unsubscribe();
        expect(getKanbanRegistry(doc).has("absent")).toBe(false);
    });

    it("re-points the source reference only at an existing Table of the same project", () => {
        const { doc, tableId } = tasksProject();
        const otherTable = createTable(doc, "Notes", "notes");
        const kanbanId = createKanban(doc, tableId, { name: "Board", query: "SELECT id FROM tasks" });

        updateKanban(doc, kanbanId, { sourceTableId: otherTable });
        expect(getKanbanSourceTableId(doc, kanbanId)).toBe(otherTable);

        expect(() => updateKanban(doc, kanbanId, { sourceTableId: "missing-table" })).toThrow(/does not exist/);
        expect(getKanbanSourceTableId(doc, kanbanId)).toBe(otherTable);
    });
});

describe("Kanban consumer lifetime", () => {
    it("keeps observation and history usable until the last consumer releases", () => {
        globalUndoRouter.clear();
        const { doc, tableId } = tasksProject();
        const kanbanId = createKanban(doc, tableId, { name: "Board" });
        const other = createKanban(doc, tableId, { name: "Other" });
        const first = getKanbanHandles(doc, kanbanId)!;
        const second = getKanbanHandles(doc, kanbanId)!;
        expect(first.undo).toBe(second.undo);

        retainKanbanUndoManager(first.entry);
        retainKanbanUndoManager(first.entry);

        // Releasing one of two consumers keeps the shared manager alive.
        destroyKanbanUndoManager(first.entry);

        let notifications = 0;
        const unsubscribe = observeKanbans(doc, () => notifications++);
        const seen = notifications;
        updateKanban(doc, kanbanId, { name: "Renamed" });
        expect(notifications).toBeGreaterThan(seen);
        expect(getKanban(doc, kanbanId)?.name).toBe("Renamed");

        // History remains usable through the surviving consumer.
        globalUndoRouter.undo();
        expect(getKanban(doc, kanbanId)?.name).toBe("Board");
        globalUndoRouter.redo();
        expect(getKanban(doc, kanbanId)?.name).toBe("Renamed");
        unsubscribe();

        // Releasing the last consumer cleans up local resources without
        // deleting persisted state or mutating any other board.
        destroyKanbanUndoManager(first.entry);
        expect(getKanban(doc, kanbanId)?.name).toBe("Renamed");
        expect(getKanban(doc, other)?.name).toBe("Other");

        const reopened = getKanbanHandles(doc, kanbanId)!;
        expect(reopened.undo).not.toBe(first.undo);
        updateKanban(doc, kanbanId, { name: "Again" });
        expect(getKanban(doc, kanbanId)?.name).toBe("Again");

        destroyKanbanUndoManager(reopened.entry);
        globalUndoRouter.clear();
    });
});
