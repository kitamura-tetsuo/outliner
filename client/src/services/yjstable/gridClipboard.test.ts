// Spreadsheet-style Grid clipboard (FTR-5192): rectangular copy of the
// logical selection, and rectangular paste with spreadsheet fill/shape
// rules. Covers: single-cell copy, rectangular copy, row/column/all
// selection copy, tab/newline quoting round-trip, one-cell-to-range fill,
// rectangular paste at an active cell, tiling a smaller source over an
// exact larger target, shape-mismatch rejection, writable/read-only
// mixtures, invalid type conversion aborting the whole paste, and one Yjs
// transaction (one Undo step) per paste.

import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { buildGridCopyPayload, commitGridPaste, parseClipboardRectangle, planGridPaste } from "./gridClipboard";
import { GridSelection } from "./gridSelection";
import type { GridCommandContext, GridCommandRowTarget } from "./gridSelectionCommands";
import { addRecord, createTable, getTableHandles, type TableHandles } from "./tableDocs";

const COLUMNS = ["name", "done", "status", "score"];

function setup(rows: Array<{ name: string; done: boolean; status: string; score: number; }>) {
    const doc = new Y.Doc();
    const tableId = createTable(doc, "tasks", "tasks");
    const handles = getTableHandles(doc, tableId)!;
    const rowTargets = new Map<string, GridCommandRowTarget>();
    const rowIds: string[] = [];
    for (const values of rows) {
        const recordId = addRecord(handles, values);
        rowIds.push(recordId);
        rowTargets.set(recordId, { row: { id: recordId, ...values }, recordId });
    }
    const ctx: GridCommandContext = {
        handles,
        session: { resolveRelation: async () => undefined },
        rowTargets,
        columnOrder: COLUMNS,
        editableColumns: new Set(["name", "done", "status", "score"]),
        valueKindOf: (columnId) => {
            if (columnId === "done") return "checkbox";
            if (columnId === "status") return "select";
            if (columnId === "score") return "number";
            return "text";
        },
        checkOptionsOf: (columnId) => columnId === "status" ? ["Open", "Done"] : undefined,
        isNullableOf: () => true,
    };
    return { handles, rowIds, ctx };
}

function valueOf(handles: TableHandles, recordId: string, column: string): unknown {
    return handles.data.get(recordId)?.get(column);
}

describe("parseClipboardRectangle", () => {
    it("splits rows on newlines and columns on tabs", () => {
        expect(parseClipboardRectangle("a\tb\nc\td")).toEqual([["a", "b"], ["c", "d"]]);
    });

    it("drops a single trailing blank row caused by a trailing newline", () => {
        expect(parseClipboardRectangle("a\tb\n")).toEqual([["a", "b"]]);
    });

    it("normalizes CRLF line endings", () => {
        expect(parseClipboardRectangle("a\tb\r\nc\td")).toEqual([["a", "b"], ["c", "d"]]);
    });

    it("honors RFC-4180 quoting for a cell containing a tab or newline", () => {
        expect(parseClipboardRectangle('"a\tb"\tc\n"d\ne"\tf')).toEqual([["a\tb", "c"], ["d\ne", "f"]]);
    });

    it("unescapes doubled quotes inside a quoted field", () => {
        expect(parseClipboardRectangle('"say ""hi"""\tb')).toEqual([['say "hi"', "b"]]);
    });

    it("treats an empty string as a single blank cell", () => {
        expect(parseClipboardRectangle("")).toEqual([[""]]);
    });
});

describe("buildGridCopyPayload", () => {
    it("returns undefined for an empty selection", () => {
        const { ctx, rowIds } = setup([{ name: "Alpha", done: false, status: "Open", score: 1 }]);
        const selection = new GridSelection();
        expect(buildGridCopyPayload(selection, ctx, rowIds)).toBeUndefined();
    });

    it("copies a single cell as one line, no header", () => {
        const { ctx, rowIds } = setup([{ name: "Alpha", done: false, status: "Open", score: 1 }]);
        const selection = new GridSelection();
        selection.select({ rowId: rowIds[0], columnId: "name" });
        const payload = buildGridCopyPayload(selection, ctx, rowIds);
        expect(payload).toEqual({ text: "Alpha", html: expect.stringContaining("Alpha"), rows: 1, columns: 1 });
    });

    it("copies a rectangular range as tab/newline rows in logical order", () => {
        const { ctx, rowIds } = setup([
            { name: "Alpha", done: false, status: "Open", score: 1 },
            { name: "Beta", done: true, status: "Done", score: 2 },
        ]);
        const selection = new GridSelection();
        selection.select({ rowId: rowIds[0], columnId: "name" });
        selection.extend({ rowId: rowIds[1], columnId: "status" }, rowIds, COLUMNS);
        const payload = buildGridCopyPayload(selection, ctx, rowIds);
        expect(payload?.text).toBe("Alpha\tfalse\tOpen\nBeta\ttrue\tDone");
        expect(payload?.rows).toBe(2);
        expect(payload?.columns).toBe(3);
    });

    it("quotes a cell value containing a tab or newline (RFC 4180-style)", () => {
        const { ctx, rowIds } = setup([{ name: "Alpha\tTab", done: false, status: "Open", score: 1 }]);
        const selection = new GridSelection();
        selection.select({ rowId: rowIds[0], columnId: "name" });
        const payload = buildGridCopyPayload(selection, ctx, rowIds);
        expect(payload?.text).toBe('"Alpha\tTab"');
    });

    it("copies a row selection's visible cells across every column", () => {
        const { ctx, rowIds } = setup([
            { name: "Alpha", done: false, status: "Open", score: 1 },
            { name: "Beta", done: true, status: "Done", score: 2 },
        ]);
        const selection = new GridSelection();
        selection.selectRow(rowIds[0], rowIds);
        const payload = buildGridCopyPayload(selection, ctx, rowIds);
        expect(payload?.text).toBe("Alpha\tfalse\tOpen\t1");
    });

    it("copies a column selection's visible cells across every row", () => {
        const { ctx, rowIds } = setup([
            { name: "Alpha", done: false, status: "Open", score: 1 },
            { name: "Beta", done: true, status: "Done", score: 2 },
        ]);
        const selection = new GridSelection();
        selection.selectColumn("name", COLUMNS);
        const payload = buildGridCopyPayload(selection, ctx, rowIds);
        expect(payload?.text).toBe("Alpha\nBeta");
    });

    it("copies the whole result for a select-all selection", () => {
        const { ctx, rowIds } = setup([
            { name: "Alpha", done: false, status: "Open", score: 1 },
            { name: "Beta", done: true, status: "Done", score: 2 },
        ]);
        const selection = new GridSelection();
        selection.selectAll();
        const payload = buildGridCopyPayload(selection, ctx, rowIds);
        expect(payload?.text).toBe("Alpha\tfalse\tOpen\t1\nBeta\ttrue\tDone\t2");
    });
});

describe("planGridPaste", () => {
    it("fills a multi-cell selection by repeating a single copied cell", () => {
        const { ctx, rowIds } = setup([
            { name: "Alpha", done: false, status: "Open", score: 1 },
            { name: "Beta", done: true, status: "Done", score: 2 },
        ]);
        const selection = new GridSelection();
        selection.select({ rowId: rowIds[0], columnId: "name" });
        selection.extend({ rowId: rowIds[1], columnId: "name" }, rowIds, COLUMNS);
        const plan = planGridPaste(selection, ctx, rowIds, "Zed");
        expect(plan.kind).toBe("apply");
        if (plan.kind !== "apply") return;
        expect(plan.writes).toHaveLength(2);
        expect(plan.writes.every(w => w.value === "Zed")).toBe(true);
    });

    it("fills the corresponding rectangle when a rectangular source is pasted at one active cell", () => {
        const { ctx, rowIds } = setup([
            { name: "Alpha", done: false, status: "Open", score: 1 },
            { name: "Beta", done: true, status: "Done", score: 2 },
        ]);
        const selection = new GridSelection();
        // Anchored at "status" (columnOrder = name, done, status, score), the
        // 2x2 source rectangle expands into status+score for both rows.
        selection.select({ rowId: rowIds[0], columnId: "status" });
        const plan = planGridPaste(selection, ctx, rowIds, "Done\t5\nOpen\t6");
        expect(plan.kind).toBe("apply");
        if (plan.kind !== "apply") return;
        expect(plan.writes).toHaveLength(4);
        expect(
            plan.writes.find(w => w.target.rowTarget.recordId === rowIds[0] && w.target.columnId === "status")?.value,
        ).toBe("Done");
        expect(
            plan.writes.find(w => w.target.rowTarget.recordId === rowIds[1] && w.target.columnId === "score")?.value,
        ).toBe(6);
    });

    it("rejects a rectangular paste that runs past the last available row as a shape mismatch", () => {
        const { ctx, rowIds } = setup([{ name: "Alpha", done: false, status: "Open", score: 1 }]);
        const selection = new GridSelection();
        selection.select({ rowId: rowIds[0], columnId: "name" });
        const plan = planGridPaste(selection, ctx, rowIds, "X\nY");
        expect(plan).toMatchObject({ kind: "shape-mismatch", sourceRows: 2, targetRows: 1 });
    });

    it("tiles a smaller source that evenly divides a larger target range", () => {
        const { ctx, rowIds } = setup([
            { name: "Alpha", done: false, status: "Open", score: 1 },
            { name: "Beta", done: true, status: "Done", score: 2 },
            { name: "Gamma", done: false, status: "Open", score: 3 },
            { name: "Delta", done: true, status: "Done", score: 4 },
        ]);
        const selection = new GridSelection();
        selection.select({ rowId: rowIds[0], columnId: "name" });
        selection.extend({ rowId: rowIds[3], columnId: "name" }, rowIds, COLUMNS);
        const plan = planGridPaste(selection, ctx, rowIds, "P\nQ");
        expect(plan.kind).toBe("apply");
        if (plan.kind !== "apply") return;
        expect(plan.writes.map(w => w.value)).toEqual(["P", "Q", "P", "Q"]);
    });

    it("rejects an ambiguous shape mismatch (target not evenly divisible by source) rather than truncating", () => {
        const { ctx, rowIds } = setup([
            { name: "Alpha", done: false, status: "Open", score: 1 },
            { name: "Beta", done: true, status: "Done", score: 2 },
            { name: "Gamma", done: false, status: "Open", score: 3 },
        ]);
        const selection = new GridSelection();
        selection.select({ rowId: rowIds[0], columnId: "name" });
        selection.extend({ rowId: rowIds[2], columnId: "name" }, rowIds, COLUMNS);
        const plan = planGridPaste(selection, ctx, rowIds, "P\nQ");
        expect(plan).toMatchObject({ kind: "shape-mismatch", sourceRows: 2, targetRows: 3 });
    });

    it("rejects a paste with no cell/range selection to anchor onto (a rows-kind selection)", () => {
        const { ctx, rowIds } = setup([{ name: "Alpha", done: false, status: "Open", score: 1 }]);
        const selection = new GridSelection();
        selection.selectRow(rowIds[0], rowIds);
        expect(planGridPaste(selection, ctx, rowIds, "X").kind).toBe("no-target");
    });

    it("skips read-only/non-writable cells as mutation candidates", () => {
        const { ctx, rowIds } = setup([{ name: "Alpha", done: false, status: "Open", score: 1 }]);
        const readOnlyCtx: GridCommandContext = { ...ctx, editableColumns: new Set(["done", "status", "score"]) };
        const selection = new GridSelection();
        selection.select({ rowId: rowIds[0], columnId: "name" });
        expect(planGridPaste(selection, readOnlyCtx, rowIds, "X").kind).toBe("no-writable-cells");
    });

    it("aborts the whole paste on an invalid type conversion, writing nothing", () => {
        const { ctx, rowIds } = setup([
            { name: "Alpha", done: false, status: "Open", score: 1 },
            { name: "Beta", done: true, status: "Done", score: 2 },
        ]);
        const selection = new GridSelection();
        selection.select({ rowId: rowIds[0], columnId: "score" });
        selection.extend({ rowId: rowIds[1], columnId: "score" }, rowIds, COLUMNS);
        // "abc" is not a finite number -- the whole rectangle must be rejected,
        // not just the offending cell.
        const plan = planGridPaste(selection, ctx, rowIds, "abc");
        expect(plan).toMatchObject({ kind: "invalid-value", columnId: "score" });
    });

    it("rejects a value invalid for a select column's check constraint", () => {
        const { ctx, rowIds } = setup([{ name: "Alpha", done: false, status: "Open", score: 1 }]);
        const selection = new GridSelection();
        selection.select({ rowId: rowIds[0], columnId: "status" });
        expect(planGridPaste(selection, ctx, rowIds, "Archived").kind).toBe("invalid-value");
    });
});

describe("commitGridPaste", () => {
    it("applies every write in one Yjs transaction (one Undo step)", () => {
        const { ctx, handles, rowIds } = setup([
            { name: "Alpha", done: false, status: "Open", score: 1 },
            { name: "Beta", done: true, status: "Done", score: 2 },
        ]);
        const selection = new GridSelection();
        selection.select({ rowId: rowIds[0], columnId: "name" });
        selection.extend({ rowId: rowIds[1], columnId: "name" }, rowIds, COLUMNS);
        const plan = planGridPaste(selection, ctx, rowIds, "Zed");
        expect(plan.kind).toBe("apply");
        if (plan.kind !== "apply") return;

        let transactions = 0;
        handles.doc.on("afterTransaction", () => transactions++);
        commitGridPaste(ctx, plan.writes);

        expect(transactions).toBe(1);
        expect(valueOf(handles, rowIds[0], "name")).toBe("Zed");
        expect(valueOf(handles, rowIds[1], "name")).toBe("Zed");
    });
});
