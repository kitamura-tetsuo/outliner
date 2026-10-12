// Kanban collaboration (issue #5541): concurrent leaf edits, undo/redo
// isolation and persistence restart. Every test starts at the production
// operations in `./kanbanDocs` on actual Yjs documents synchronized with real
// Yjs updates — never by hand-building the internal registry map.

import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { globalUndoRouter } from "../undo/undoRouter.svelte";
import {
    createKanban,
    destroyKanbanUndoManager,
    getKanban,
    getKanbanHandles,
    removeKanban,
    updateKanban,
} from "./kanbanDocs";
import { addRecord, createTable, getTableHandles } from "./tableDocs";

/** Remote updates cross with a provider-like origin so each replica's local history tracks only its own edits. */
function exchange(docA: Y.Doc, docB: Y.Doc): void {
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA), "kanban-test-sync");
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB), "kanban-test-sync");
}

function boardPair(): { docA: Y.Doc; docB: Y.Doc; tableId: string; kanbanId: string; } {
    const docA = new Y.Doc();
    const tableId = createTable(docA, "Tasks", "tasks");
    const table = getTableHandles(docA, tableId)!;
    addRecord(table, { id: "row-1", status: "open" });
    const kanbanId = createKanban(
        docA,
        tableId,
        { kanbanId: "board-1", name: "Board", query: "SELECT id FROM tasks", titleField: "id" },
    );
    const docB = new Y.Doc();
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    return { docA, docB, tableId, kanbanId };
}

describe("Kanban concurrent settings", () => {
    it("merges disjoint edits, then undoes only the local one without touching Table data", () => {
        const { docA, docB, tableId, kanbanId } = boardPair();

        // Buffer each side's own updates while "disconnected".
        const pendingA: Uint8Array[] = [];
        const pendingB: Uint8Array[] = [];
        docA.on("update", update => pendingA.push(update));
        docB.on("update", update => pendingB.push(update));

        updateKanban(docA, kanbanId, { query: "SELECT id, status FROM tasks" });
        updateKanban(docB, kanbanId, { titleField: "status" });
        for (const update of pendingA) Y.applyUpdate(docB, update, "kanban-test-sync");
        for (const update of pendingB) Y.applyUpdate(docA, update, "kanban-test-sync");

        for (const doc of [docA, docB]) {
            expect(getKanban(doc, kanbanId)?.query).toBe("SELECT id, status FROM tasks");
            expect(getKanban(doc, kanbanId)?.titleField).toBe("status");
        }

        // Undoing the local query edit keeps the peer's title role.
        const handlesA = getKanbanHandles(docA, kanbanId)!;
        handlesA.undo.undo();
        expect(getKanban(docA, kanbanId)?.query).toBe("SELECT id FROM tasks");
        expect(getKanban(docA, kanbanId)?.titleField).toBe("status");
        expect(getTableHandles(docA, tableId)!.data.size).toBe(1);

        // Redo reapplies only the local query change.
        handlesA.undo.redo();
        expect(getKanban(docA, kanbanId)?.query).toBe("SELECT id, status FROM tasks");
        expect(getKanban(docA, kanbanId)?.titleField).toBe("status");
        expect(getTableHandles(docA, tableId)!.data.size).toBe(1);

        destroyKanbanUndoManager(handlesA.entry);
        const handlesB = getKanbanHandles(docB, kanbanId)!;
        destroyKanbanUndoManager(handlesB.entry);
        globalUndoRouter.clear();
    });

    it("records no history for reads, rejected edits and same-value no-ops", () => {
        globalUndoRouter.clear();
        const { docA, kanbanId } = boardPair();
        const handles = getKanbanHandles(docA, kanbanId)!;
        let updates = 0;
        docA.on("update", () => updates++);
        const stackBefore = handles.undo.undoStack.length;

        // Reads change nothing.
        expect(getKanban(docA, kanbanId)?.query).toBe("SELECT id FROM tasks");
        getKanbanHandles(docA, "absent");

        // A rejected edit throws before publishing any part of itself.
        expect(() => updateKanban(docA, kanbanId, { query: "SELECT 2", detailFields: ["a", "a"] })).toThrow(
            /Duplicate/,
        );

        // Identical-value invocations are fully effect-free.
        updateKanban(docA, kanbanId, { query: "SELECT id FROM tasks" });
        updateKanban(docA, kanbanId, { titleField: "id", detailFields: [], laneOrder: [] });

        expect(updates).toBe(0);
        expect(handles.undo.undoStack.length).toBe(stackBefore);
        expect(getKanban(docA, kanbanId)?.query).toBe("SELECT id FROM tasks");

        destroyKanbanUndoManager(handles.entry);
        globalUndoRouter.clear();
    });
});

describe("Kanban history through the global router", () => {
    it("isolates one completed update as one Undo/Redo step", () => {
        globalUndoRouter.clear();
        const { docA, kanbanId } = boardPair();
        const handles = getKanbanHandles(docA, kanbanId)!;
        handles.undo.stopCapturing();

        // No test-managed capture boundaries from here on: the production
        // updater isolates each completed update itself.
        updateKanban(docA, kanbanId, { groupField: "status" });
        updateKanban(docA, kanbanId, { query: "SELECT id, status FROM tasks" });
        expect(getKanban(docA, kanbanId)?.query).toBe("SELECT id, status FROM tasks");

        // One Undo restores only the query; the group assignment stands.
        globalUndoRouter.undo();
        expect(getKanban(docA, kanbanId)?.query).toBe("SELECT id FROM tasks");
        expect(getKanban(docA, kanbanId)?.groupField).toBe("status");

        globalUndoRouter.redo();
        expect(getKanban(docA, kanbanId)?.query).toBe("SELECT id, status FROM tasks");

        // Two rapid committed updates are two steps, not one merged item.
        updateKanban(docA, kanbanId, { query: "SELECT id FROM tasks WHERE status = 'open'" });
        updateKanban(docA, kanbanId, { query: "SELECT id FROM tasks WHERE status = 'done'" });
        globalUndoRouter.undo();
        expect(getKanban(docA, kanbanId)?.query).toBe("SELECT id FROM tasks WHERE status = 'open'");
        globalUndoRouter.undo();
        expect(getKanban(docA, kanbanId)?.query).toBe("SELECT id, status FROM tasks");
        expect(getKanban(docA, kanbanId)?.groupField).toBe("status");

        destroyKanbanUndoManager(handles.entry);
        globalUndoRouter.clear();
    });

    it("keeps two boards independent while sharing one Table, then removes one cleanly", () => {
        const { docA, tableId } = boardPair();
        const second = createKanban(docA, tableId, { name: "Second", query: "SELECT id FROM tasks" });

        updateKanban(docA, "board-1", { laneOrder: ["open", null] });
        expect(getKanban(docA, "board-1")?.laneOrder).toEqual(["open", null]);
        expect(getKanban(docA, second)?.laneOrder).toEqual([]);

        expect(removeKanban(docA, second)).toBe(true);
        expect(getKanban(docA, "board-1")?.laneOrder).toEqual(["open", null]);
        expect(getTableHandles(docA, tableId)!.data.size).toBe(1);

        const restarted = new Y.Doc();
        Y.applyUpdate(restarted, Y.encodeStateAsUpdate(docA));
        expect(getKanban(restarted, "board-1")?.laneOrder).toEqual(["open", null]);
        expect(getKanban(restarted, second)).toBeUndefined();

        const handles = getKanbanHandles(docA, "board-1")!;
        destroyKanbanUndoManager(handles.entry);
        globalUndoRouter.clear();
    });

    it("synchronizes one definition identically to every consumer of its id", () => {
        const { docA, docB, kanbanId } = boardPair();
        updateKanban(docA, kanbanId, { detailFields: ["status", "id"], laneOrder: [null, "open"] });
        exchange(docA, docB);

        for (const doc of [docA, docB]) {
            expect(getKanban(doc, kanbanId)).toEqual(getKanban(docA, kanbanId));
            const first = getKanbanHandles(doc, kanbanId)!;
            const second = getKanbanHandles(doc, kanbanId)!;
            expect(first.undo).toBe(second.undo);
            destroyKanbanUndoManager(first.entry);
        }
        globalUndoRouter.clear();
    });
});
