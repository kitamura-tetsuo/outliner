import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createGrid, getGridHandles, getGridRegistry, setGridQuery } from "../yjstable/gridDocs";
import { addRecord, createTable, getTableHandles, getTableRegistry, setRecordValue } from "../yjstable/tableDocs";
import { bindProjectHistoryAuthorization } from "./projectHistoryAuthorization";
import { globalUndoRouter } from "./undoRouter.svelte";

const docs: Y.Doc[] = [];
afterEach(() => {
    docs.splice(0).forEach(doc => doc.destroy());
    globalUndoRouter.clear();
});
function owner() {
    const doc = new Y.Doc();
    docs.push(doc);
    const grid = getGridHandles(doc, createGrid(doc, { query: "SELECT 1 AS value" }))!;
    const table = getTableHandles(doc, createTable(doc, "Rows", "rows"))!;
    addRecord(table, { title: "before" }, "row");
    grid.undo.clear();
    table.undo.clear();
    globalUndoRouter.clear();
    return { doc, grid, table };
}

describe("retained Grid/Table history authority", () => {
    for (const kind of ["Grid", "Table"] as const) {
        it(`${kind} consults its owner's live authorization even when handles predate admission`, () => {
            const { doc, grid, table } = owner();
            let allowed = true;
            bindProjectHistoryAuthorization(doc, () => allowed);
            const read = () => kind === "Grid" ? grid.entry.get("query") : table.data.get("row")?.get("title");
            if (kind === "Grid") setGridQuery(grid, "SELECT 2 AS value");
            else {
                table.undo.stopCapturing();
                setRecordValue(table, "row", "title", "after");
            }
            const after = read();
            allowed = false;
            // An unrelated local Project with valid authority must not grant access to this owner.
            const unrelated = new Y.Doc();
            docs.push(unrelated);
            bindProjectHistoryAuthorization(unrelated, () => true);
            globalUndoRouter.undo();
            expect(read()).toEqual(after);
            expect([globalUndoRouter.undoDepth, globalUndoRouter.redoDepth]).toEqual([1, 0]);
            allowed = true;
            globalUndoRouter.undo();
            const before = read();
            expect(before).not.toEqual(after);
            allowed = false;
            globalUndoRouter.redo();
            expect(read()).toEqual(before);
            expect([globalUndoRouter.undoDepth, globalUndoRouter.redoDepth]).toEqual([0, 1]);
            allowed = true;
            globalUndoRouter.redo();
            expect(read()).toEqual(after);
            getGridRegistry(doc).delete(grid.gridId);
            getTableRegistry(doc).delete(table.tableId);
            expect(globalUndoRouter.undoDepth).toBe(0);
        });
    }

    it("Project destruction ends Table scopes even while their subdocs remain referenced", () => {
        const { doc, table } = owner();
        setRecordValue(table, "row", "title", "after");
        expect(globalUndoRouter.undoDepth).toBe(1);
        doc.destroy();
        expect(globalUndoRouter.undoDepth).toBe(0);
        expect(globalUndoRouter.redoDepth).toBe(0);
    });
});
