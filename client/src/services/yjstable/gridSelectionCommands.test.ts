// Selection-aware bulk Grid editing commands (FTR-5191). Covers: bulk set,
// clear-to-NULL, checkbox/select operations, mixed writable/read-only cells,
// incompatible values (no partial mutation), column clear, safe whole-result
// behavior, selected-row removal, and one Undo step per command.

import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { GridSelection } from "./gridSelection";
import {
    applyValueToSelection,
    classifySelectionKind,
    clearSelectionToNull,
    collectSelectedRowTargets,
    convertReplacementText,
    type GridCommandContext,
    type GridCommandRowTarget,
    isValueValidForCell,
    planGridDeleteCommand,
    removeRowTargets,
    summarizeSelection,
} from "./gridSelectionCommands";
import { TABLE_RELATION_CAPABILITIES } from "./relationProvider";
import type { RelationProvider, RelationWrite } from "./relationProvider";
import { addRecord, createTable, getTableHandles, type TableHandles } from "./tableDocs";

const COLUMNS = ["name", "done", "status", "score"];

function setup(rows: Array<{ name: string; done: boolean; status: string; score: number; }>) {
    const doc = new Y.Doc();
    const tableId = createTable(doc, "tasks", "tasks");
    const handles = getTableHandles(doc, tableId)!;
    const rowTargets = new Map<string, GridCommandRowTarget>();
    for (const values of rows) {
        const recordId = addRecord(handles, values);
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
    return { handles, rowTargets: [...rowTargets.keys()], ctx };
}

function valueOf(handles: TableHandles, recordId: string, column: string): unknown {
    return handles.data.get(recordId)?.get(column);
}

describe("classifySelectionKind", () => {
    it("reads none/cells/rows/columns/all from a selection's regions", () => {
        const selection = new GridSelection();
        expect(classifySelectionKind(selection.regions)).toBe("none");

        selection.select({ rowId: "a", columnId: "name" });
        expect(classifySelectionKind(selection.regions)).toBe("cells");

        selection.selectRow("a", ["a", "b"]);
        expect(classifySelectionKind(selection.regions)).toBe("rows");

        selection.selectColumn("name", ["name", "done"]);
        expect(classifySelectionKind(selection.regions)).toBe("columns");

        selection.selectAll();
        expect(classifySelectionKind(selection.regions)).toBe("all");
    });

    it("treats a rows selection composed with an extra toggled cell as a cell selection", () => {
        // GridSelection.toggleCell appends an `include-cells`/`cells` region
        // rather than replacing the existing `rows` one (see gridSelection.ts),
        // so a Ctrl-click on an unrelated cell after a row-header pick leaves
        // both regions present. Delete must clear every selected cell rather
        // than silently drop the extra one by picking "rows".
        const selection = new GridSelection();
        selection.selectRow("a", ["a", "b", "c"]);
        selection.toggleCell({ rowId: "c", columnId: "name" });
        expect(classifySelectionKind(selection.regions)).toBe("cells");
    });
});

describe("isValueValidForCell", () => {
    it("rejects NULL for a column whose schema does not allow it", () => {
        const ctx = { valueKindOf: () => "text" as const, checkOptionsOf: () => undefined, isNullableOf: () => false };
        expect(isValueValidForCell(ctx, "name", null)).toBe(false);
    });

    it("accepts NULL for a nullable column", () => {
        const ctx = { valueKindOf: () => "text" as const, checkOptionsOf: () => undefined, isNullableOf: () => true };
        expect(isValueValidForCell(ctx, "name", null)).toBe(true);
    });
});

describe("convertReplacementText", () => {
    it("passes text through verbatim, empty string included", () => {
        const ctx = { valueKindOf: () => "text" as const, checkOptionsOf: () => undefined, isNullableOf: () => false };
        expect(convertReplacementText(ctx, "name", "hello")).toBe("hello");
        expect(convertReplacementText(ctx, "name", "")).toBe("");
    });

    it("parses a number deterministically and rejects non-numeric text", () => {
        const ctx = { valueKindOf: () => "number" as const, checkOptionsOf: () => undefined, isNullableOf: () => true };
        expect(convertReplacementText(ctx, "score", "42")).toBe(42);
        expect(convertReplacementText(ctx, "score", "4.5")).toBe(4.5);
        expect(convertReplacementText(ctx, "score", "not a number")).toBeUndefined();
    });

    it('parses "true"/"false" for a checkbox and rejects anything else', () => {
        const ctx = {
            valueKindOf: () => "checkbox" as const,
            checkOptionsOf: () => undefined,
            isNullableOf: () => true,
        };
        expect(convertReplacementText(ctx, "done", "true")).toBe(true);
        expect(convertReplacementText(ctx, "done", "false")).toBe(false);
        expect(convertReplacementText(ctx, "done", "yes")).toBeUndefined();
    });

    it("only accepts select values already in the column's own options", () => {
        const ctx = {
            valueKindOf: () => "select" as const,
            checkOptionsOf: () => ["Open", "Done"],
            isNullableOf: () => true,
        };
        expect(convertReplacementText(ctx, "status", "Done")).toBe("Done");
        expect(convertReplacementText(ctx, "status", "Archived")).toBeUndefined();
    });

    it("only accepts a real calendar date for a date column", () => {
        const ctx = { valueKindOf: () => "date" as const, checkOptionsOf: () => undefined, isNullableOf: () => true };
        expect(convertReplacementText(ctx, "due", "2025-01-02")).toBe("2025-01-02");
        expect(convertReplacementText(ctx, "due", "2025-13-40")).toBeUndefined();
        expect(convertReplacementText(ctx, "due", "not a date")).toBeUndefined();
    });

    it("maps an emptied non-text result to NULL when nullable, and rejects it otherwise", () => {
        const nullable = {
            valueKindOf: () => "number" as const,
            checkOptionsOf: () => undefined,
            isNullableOf: () => true,
        };
        expect(convertReplacementText(nullable, "score", "")).toBeNull();
        const notNullable = {
            valueKindOf: () => "number" as const,
            checkOptionsOf: () => undefined,
            isNullableOf: () => false,
        };
        expect(convertReplacementText(notNullable, "score", "")).toBeUndefined();
    });
});

describe("summarizeSelection", () => {
    it('reports mixed writable/read-only cells (e.g. "12 cells selected · 9 editable")', () => {
        const { ctx, rowTargets } = setup([
            { name: "A", done: false, status: "Open", score: 1 },
            { name: "B", done: true, status: "Done", score: 2 },
        ]);
        const readOnlyCtx: GridCommandContext = { ...ctx, editableColumns: new Set(["name", "done"]) };
        const selection = new GridSelection();
        selection.select({ rowId: rowTargets[0], columnId: "name" });
        selection.extend({ rowId: rowTargets[1], columnId: "score" }, rowTargets, COLUMNS);

        const summary = summarizeSelection(selection, readOnlyCtx);
        expect(summary.kind).toBe("cells");
        expect(summary.totalCells).toBe(8); // 2 rows x 4 columns
        expect(summary.writableTargets).toHaveLength(4); // name + done, both rows
    });
});

describe("applyValueToSelection", () => {
    it("bulk-sets a checkbox value across every selected writable cell as one Undo step", () => {
        const { handles, ctx, rowTargets } = setup([
            { name: "A", done: false, status: "Open", score: 1 },
            { name: "B", done: false, status: "Done", score: 2 },
        ]);
        const selection = new GridSelection();
        selection.selectColumn("done", COLUMNS);

        handles.undo.stopCapturing();
        const before = handles.undo.undoStack.length;
        const outcome = applyValueToSelection(selection, ctx, true);

        expect(outcome).toEqual({ applied: true, count: 2 });
        expect(valueOf(handles, rowTargets[0], "done")).toBe(true);
        expect(valueOf(handles, rowTargets[1], "done")).toBe(true);
        expect(handles.undo.undoStack.length).toBe(before + 1);

        handles.undo.undo();
        expect(valueOf(handles, rowTargets[0], "done")).toBe(false);
        expect(valueOf(handles, rowTargets[1], "done")).toBe(false);
    });

    it("bulk-sets a select value only when it is one of the column's own options", () => {
        const { handles, ctx, rowTargets } = setup([
            { name: "A", done: false, status: "Open", score: 1 },
            { name: "B", done: false, status: "Open", score: 2 },
        ]);
        const selection = new GridSelection();
        selection.selectColumn("status", COLUMNS);

        expect(applyValueToSelection(selection, ctx, "Done")).toEqual({ applied: true, count: 2 });
        expect(valueOf(handles, rowTargets[0], "status")).toBe("Done");

        expect(applyValueToSelection(selection, ctx, "Archived")).toEqual({ applied: false, reason: "invalid-value" });
        expect(valueOf(handles, rowTargets[0], "status")).toBe("Done"); // unchanged
    });

    it("never partially mutates the selection when one target's type is incompatible", () => {
        const { handles, ctx, rowTargets } = setup([
            { name: "A", done: false, status: "Open", score: 1 },
        ]);
        const selection = new GridSelection();
        selection.select({ rowId: rowTargets[0], columnId: "name" });
        selection.extend({ rowId: rowTargets[0], columnId: "done" }, rowTargets, COLUMNS);
        // Selection now spans "name" (text) and "done" (checkbox) on one row.

        const outcome = applyValueToSelection(selection, ctx, true);
        expect(outcome).toEqual({ applied: false, reason: "invalid-value" });
        expect(valueOf(handles, rowTargets[0], "done")).toBe(false);
        expect(valueOf(handles, rowTargets[0], "name")).toBe("A");
    });

    it("skips read-only/computed columns entirely, never writing them", () => {
        const { handles, ctx, rowTargets } = setup([{ name: "A", done: false, status: "Open", score: 1 }]);
        const readOnlyScore: GridCommandContext = { ...ctx, editableColumns: new Set(["name", "done", "status"]) };
        const selection = new GridSelection();
        selection.selectRow(rowTargets[0], rowTargets);
        // A row selection includes every column, "score" included, but it is not editable.
        const outcome = applyValueToSelection(selection, readOnlyScore, null);
        expect(outcome.applied).toBe(true);
        expect(valueOf(handles, rowTargets[0], "score")).toBe(1); // untouched
        expect(valueOf(handles, rowTargets[0], "name")).toBe(null);
    });
});

describe("clearSelectionToNull", () => {
    it("clears a whole selected column to NULL, leaving other columns untouched", () => {
        const { handles, ctx, rowTargets } = setup([
            { name: "A", done: true, status: "Open", score: 1 },
            { name: "B", done: true, status: "Done", score: 2 },
        ]);
        const selection = new GridSelection();
        selection.selectColumn("status", COLUMNS);

        const outcome = clearSelectionToNull(selection, ctx);
        expect(outcome).toEqual({ applied: true, count: 2 });
        expect(valueOf(handles, rowTargets[0], "status")).toBe(null);
        expect(valueOf(handles, rowTargets[1], "status")).toBe(null);
        expect(valueOf(handles, rowTargets[0], "name")).toBe("A");
        expect(valueOf(handles, rowTargets[0], "done")).toBe(true);
    });

    it('clears a NOT NULL text column to "" instead of NULL', () => {
        const { handles, ctx, rowTargets } = setup([{ name: "A", done: false, status: "Open", score: 1 }]);
        const notNullName: GridCommandContext = {
            ...ctx,
            isNullableOf: (columnId) => columnId !== "name",
        };
        const selection = new GridSelection();
        selection.selectColumn("name", COLUMNS);

        const outcome = clearSelectionToNull(selection, notNullName);
        expect(outcome).toEqual({ applied: true, count: 1 });
        expect(valueOf(handles, rowTargets[0], "name")).toBe("");
    });

    it("leaves a NOT NULL non-text column untouched, but still clears the rest of the selection", () => {
        const { handles, ctx, rowTargets } = setup([{ name: "A", done: false, status: "Open", score: 1 }]);
        const notNullScore: GridCommandContext = {
            ...ctx,
            isNullableOf: (columnId) => columnId !== "score",
        };
        const selection = new GridSelection();
        selection.select({ rowId: rowTargets[0], columnId: "name" });
        selection.extend({ rowId: rowTargets[0], columnId: "score" }, rowTargets, COLUMNS);

        const outcome = clearSelectionToNull(selection, notNullScore);
        expect(outcome.applied).toBe(true);
        expect(valueOf(handles, rowTargets[0], "score")).toBe(1); // no schema-valid empty value for a NOT NULL number
        expect(valueOf(handles, rowTargets[0], "name")).toBe(null);
        expect(valueOf(handles, rowTargets[0], "done")).toBe(null); // cleared too (nullable), part of the same range
    });
});

describe("planGridDeleteCommand", () => {
    it("removes records for a rows-kind selection", () => {
        const { handles, ctx, rowTargets } = setup([
            { name: "A", done: false, status: "Open", score: 1 },
            { name: "B", done: false, status: "Open", score: 2 },
            { name: "C", done: false, status: "Open", score: 3 },
        ]);
        const selection = new GridSelection();
        selection.selectRow(rowTargets[0], rowTargets);
        selection.selectRow(rowTargets[2], rowTargets, { toggle: true });

        const plan = planGridDeleteCommand(selection, ctx);
        expect(plan.kind).toBe("remove-rows");
        if (plan.kind !== "remove-rows") throw new Error("unreachable");
        expect(plan.targets.map(t => t.recordId).sort()).toEqual([rowTargets[0], rowTargets[2]].sort());

        removeRowTargets(ctx, plan.targets);
        expect(handles.data.has(rowTargets[0])).toBe(false);
        expect(handles.data.has(rowTargets[2])).toBe(false);
        expect(handles.data.has(rowTargets[1])).toBe(true);
    });

    it("clears cells instead of removing records for a cell/range selection", () => {
        const { handles, ctx, rowTargets } = setup([{ name: "A", done: false, status: "Open", score: 1 }]);
        const selection = new GridSelection();
        selection.select({ rowId: rowTargets[0], columnId: "name" });

        const plan = planGridDeleteCommand(selection, ctx);
        expect(plan.kind).toBe("clear-cells");
        expect(handles.data.has(rowTargets[0])).toBe(true);
        expect(valueOf(handles, rowTargets[0], "name")).toBe(null);
    });

    it("clears cells instead of removing records for a column selection", () => {
        const { handles, ctx, rowTargets } = setup([{ name: "A", done: false, status: "Open", score: 1 }]);
        const selection = new GridSelection();
        selection.selectColumn("name", COLUMNS);

        planGridDeleteCommand(selection, ctx);
        expect(handles.data.has(rowTargets[0])).toBe(true);
        expect(valueOf(handles, rowTargets[0], "name")).toBe(null);
    });

    it("never turns a whole-result (select-all) selection into a destructive row removal", () => {
        const { handles, ctx, rowTargets } = setup([
            { name: "A", done: false, status: "Open", score: 1 },
            { name: "B", done: false, status: "Open", score: 2 },
        ]);
        const selection = new GridSelection();
        selection.selectAll();

        const plan = planGridDeleteCommand(selection, ctx);
        expect(plan.kind).toBe("clear-cells");
        expect(handles.data.size).toBe(2);
        for (const recordId of rowTargets) {
            expect(valueOf(handles, recordId, "name")).toBe(null);
        }
    });

    it("excludes source-addressed rows from a rows-kind removal (no delete-disposition prompt here)", () => {
        const { ctx, rowTargets } = setup([{ name: "A", done: false, status: "Open", score: 1 }]);
        const mixedCtx: GridCommandContext = {
            ...ctx,
            rowTargets: new Map([
                ...ctx.rowTargets,
                ["widgets:row-1", {
                    row: { source_kind: "widgets", source_id: "row-1" },
                    source: { sourceKind: "widgets", sourceId: "row-1" },
                }],
            ]),
        };
        const selection = new GridSelection();
        selection.selectRow(rowTargets[0], [rowTargets[0], "widgets:row-1"]);
        selection.selectRow("widgets:row-1", [rowTargets[0], "widgets:row-1"], { toggle: true });

        const plan = planGridDeleteCommand(selection, mixedCtx);
        expect(plan.kind).toBe("remove-rows");
        if (plan.kind !== "remove-rows") throw new Error("unreachable");
        expect(plan.targets.map(t => t.recordId)).toEqual([rowTargets[0]]);
    });
});

describe("collectSelectedRowTargets + removeRowTargets for unioned/source rows", () => {
    class RecordingProvider implements RelationProvider {
        readonly sqlName = "widgets";
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

    it("removes a source-addressed row through its own relation", async () => {
        const doc = new Y.Doc();
        const tableId = createTable(doc, "tasks", "tasks");
        const handles = getTableHandles(doc, tableId)!;
        const provider = new RecordingProvider();
        const ctx: GridCommandContext = {
            handles,
            session: { resolveRelation: async (name) => name === "widgets" ? provider : undefined },
            rowTargets: new Map([["widgets:row-1", {
                row: { source_kind: "widgets", source_id: "row-1" },
                source: { sourceKind: "widgets", sourceId: "row-1" },
            }]]),
            columnOrder: COLUMNS,
            editableColumns: new Set(COLUMNS),
            valueKindOf: () => "text",
            checkOptionsOf: () => undefined,
            isNullableOf: () => true,
        };
        const selection = new GridSelection();
        selection.selectRow("widgets:row-1", ["widgets:row-1"]);

        const targets = collectSelectedRowTargets(selection, ctx);
        removeRowTargets(ctx, targets);
        await Promise.resolve();

        expect(provider.writes).toEqual([{ op: "DELETE", rowId: "row-1", disposition: undefined }]);
    });
});
