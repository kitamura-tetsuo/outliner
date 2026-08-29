// Spreadsheet-style Grid clipboard: rectangular copy of the logical Grid
// selection and rectangular paste back into it (FTR-5192).
//
// Copy walks `GridSelection` the same identity-addressed way the bulk
// command layer (`gridSelectionCommands.ts`) already does — it never depends
// on which cells happen to be mounted in the DOM. Paste parses tab/newline
// clipboard text into a rectangle and maps it onto the active cell or the
// current range following Excel/Google Sheets conventions: a single copied
// cell repeats across a larger target, and a source rectangle that evenly
// tiles a larger target repeats to fill it. Anything else is an ambiguous
// shape mismatch and is rejected outright rather than silently truncated.
//
// Paste validates the *entire* target rectangle — writability, then value
// type — before writing anything, so a single incompatible cell cannot leave
// the rest of the rectangle half-pasted, and commits through the same
// `writeWritableCell`/single-transaction pattern the bulk commands use, so a
// paste collapses to one Undo step.

import { formatHtmlCell, formatTsvCell } from "../clipboard/gridClipboardExport";
import type { GridSelection } from "./gridSelection";
import {
    classifySelectionKind,
    type GridCommandContext,
    type GridWritableCellTarget,
    isValueValidForCell,
    writeWritableCell,
} from "./gridSelectionCommands";
import type { TableRecordValue } from "./tableDocs";

export interface GridCopyPayload {
    /** Tab/newline separated cells, RFC-4180-quoted like `gridClipboardExport`'s own TSV. No header row — normal copy is data only. */
    text: string;
    /** A bare `<table>` fragment for destinations that prefer HTML (Word, Sheets, Notion). */
    html: string;
    rows: number;
    columns: number;
}

/** The bounding rows/columns of a selection, in canonical grid order. Shared by copy and paste target resolution. */
function selectionBoundingBox(
    selection: GridSelection,
    rowOrder: readonly string[],
    columnOrder: readonly string[],
): { rowIds: string[]; columnIds: string[]; } {
    const rowSet = new Set<string>();
    const columnSet = new Set<string>();
    for (const rowId of rowOrder) {
        for (const columnId of columnOrder) {
            if (selection.contains({ rowId, columnId })) {
                rowSet.add(rowId);
                columnSet.add(columnId);
            }
        }
    }
    return {
        rowIds: rowOrder.filter(id => rowSet.has(id)),
        columnIds: columnOrder.filter(id => columnSet.has(id)),
    };
}

/**
 * Serializes the current logical selection into rectangular/tabular
 * clipboard flavors. Row/column/select-all selections copy every visible
 * result cell they cover; a `cells` selection copies its bounding rectangle,
 * leaving any gap left by a sparse toggle-selection blank rather than
 * collapsing the rectangle around it. Returns undefined for an empty
 * selection or a selection covering no columns/rows currently in the result
 * (e.g. every selected row was removed by a query refresh).
 */
export function buildGridCopyPayload(
    selection: GridSelection,
    ctx: Pick<GridCommandContext, "rowTargets" | "columnOrder">,
    rowOrder: readonly string[],
): GridCopyPayload | undefined {
    const kind = classifySelectionKind(selection.regions);
    if (kind === "none") return undefined;

    let rowIds: string[];
    let columnIds: string[];
    if (kind === "all") {
        rowIds = rowOrder.filter(id => ctx.rowTargets.has(id));
        columnIds = [...ctx.columnOrder];
    } else if (kind === "rows") {
        rowIds = rowOrder.filter(id => selection.containsRow(id));
        columnIds = [...ctx.columnOrder];
    } else if (kind === "columns") {
        rowIds = rowOrder.filter(id => ctx.rowTargets.has(id));
        columnIds = ctx.columnOrder.filter(id => selection.containsColumn(id));
    } else {
        ({ rowIds, columnIds } = selectionBoundingBox(selection, rowOrder, ctx.columnOrder));
    }
    if (rowIds.length === 0 || columnIds.length === 0) return undefined;

    const grid = rowIds.map(rowId => {
        const row = ctx.rowTargets.get(rowId)?.row ?? {};
        return columnIds.map(columnId =>
            kind !== "cells" || selection.contains({ rowId, columnId }) ? row[columnId] : ""
        );
    });

    const text = grid.map(cells => cells.map(formatTsvCell).join("\t")).join("\n");
    const htmlRows = grid.map(cells =>
        `    <tr>\n${cells.map(cell => `      <td>${formatHtmlCell(cell)}</td>`).join("\n")}\n    </tr>`
    );
    const html = `<table>\n  <tbody>\n${htmlRows.join("\n")}\n  </tbody>\n</table>`;

    return { text, html, rows: rowIds.length, columns: columnIds.length };
}

/**
 * Parses tab/newline clipboard text into a rectangle of raw string cells.
 * Honors RFC-4180-style quoting (a field starting with `"` runs until the
 * next unescaped `"`, with `""` an escaped quote) so a cell that itself
 * contains a tab or newline — exactly what `formatTsvCell` produces for one —
 * round-trips losslessly. A lone trailing newline (the common clipboard
 * convention) is not treated as an extra blank row.
 */
export function parseClipboardRectangle(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let inQuotes = false;
    let i = 0;
    while (i < text.length) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i += 2;
                    continue;
                }
                inQuotes = false;
                i++;
                continue;
            }
            field += ch;
            i++;
            continue;
        }
        if (ch === '"' && field === "") {
            inQuotes = true;
            i++;
            continue;
        }
        if (ch === "\t") {
            row.push(field);
            field = "";
            i++;
            continue;
        }
        if (ch === "\r") {
            i++;
            continue;
        }
        if (ch === "\n") {
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
            i++;
            continue;
        }
        field += ch;
        i++;
    }
    row.push(field);
    rows.push(row);
    if (rows.length > 1 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === "") {
        rows.pop();
    }
    return rows;
}

export interface GridPasteWrite {
    target: GridWritableCellTarget;
    value: TableRecordValue;
}

export type GridPastePlan =
    | { kind: "empty-source"; }
    /** No single active cell or cell/range selection to anchor a paste onto (e.g. a row/column/select-all selection). */
    | { kind: "no-target"; }
    | { kind: "shape-mismatch"; sourceRows: number; sourceColumns: number; targetRows: number; targetColumns: number; }
    | { kind: "invalid-value"; rowId: string; columnId: string; }
    | { kind: "no-writable-cells"; }
    | { kind: "apply"; writes: GridPasteWrite[]; };

/**
 * Converts one pasted TSV cell's raw text into a value valid for `columnId`,
 * or a deliberately-invalid placeholder that `isValueValidForCell` will
 * reject (never a silent, surprising coercion — same rule as the bulk
 * command layer). An empty source cell maps to the column's own "cleared"
 * value: `NULL` when nullable, `""` for a `NOT NULL` text column, otherwise
 * `NULL` (which then correctly fails validation for a `NOT NULL` non-text
 * column, aborting the whole paste per its "validate before mutating" rule).
 */
function parseCellValue(
    ctx: Pick<GridCommandContext, "valueKindOf" | "isNullableOf">,
    columnId: string,
    raw: string,
): TableRecordValue {
    if (raw === "") {
        if (ctx.isNullableOf(columnId)) return null;
        return ctx.valueKindOf(columnId) === "text" ? "" : null;
    }
    switch (ctx.valueKindOf(columnId)) {
        case "number":
            return Number(raw);
        case "checkbox": {
            const normalized = raw.trim().toLowerCase();
            if (normalized === "true") return true;
            if (normalized === "false") return false;
            return raw;
        }
        case "select":
        case "date":
        case "text":
        default:
            return raw;
    }
}

/**
 * Resolves pasted clipboard text against the current selection into a
 * validated write plan, without mutating anything. Only a `cells`-kind
 * selection is a valid paste target — a row/column/select-all selection has
 * no single anchor cell (see `GridSelection`, whose `activeCell` is likewise
 * undefined for those) and is rejected rather than guessing a target.
 *
 * - a single active cell (no range) expands into a `sourceRows`×`sourceColumns`
 *   rectangle starting there;
 * - a 1×1 copied cell repeats across any larger selected range;
 * - a larger source that evenly tiles the selected range's bounding box
 *   repeats to fill it (the same convention Excel/Sheets use);
 * - any other size mismatch is rejected rather than silently truncated.
 *
 * Every target cell is validated — writability, then value type — before any
 * write is planned, so an incompatible cell anywhere in the rectangle aborts
 * the whole paste instead of leaving it half-applied.
 */
export function planGridPaste(
    selection: GridSelection,
    ctx: GridCommandContext,
    rowOrder: readonly string[],
    sourceText: string,
): GridPastePlan {
    const source = parseClipboardRectangle(sourceText);
    const sourceRows = source.length;
    const sourceColumns = source.reduce((max, row) => Math.max(max, row.length), 0);
    if (sourceRows === 0 || sourceColumns === 0) return { kind: "empty-source" };

    if (classifySelectionKind(selection.regions) !== "cells") return { kind: "no-target" };

    const { rowIds: selectedRowIds, columnIds: selectedColumnIds } = selectionBoundingBox(
        selection,
        rowOrder,
        ctx.columnOrder,
    );
    if (selectedRowIds.length === 0 || selectedColumnIds.length === 0) return { kind: "no-target" };

    let targetRowIds: string[];
    let targetColumnIds: string[];
    if (selectedRowIds.length === 1 && selectedColumnIds.length === 1) {
        const anchor = selection.activeCell ?? { rowId: selectedRowIds[0], columnId: selectedColumnIds[0] };
        const rowStart = rowOrder.indexOf(anchor.rowId);
        const colStart = ctx.columnOrder.indexOf(anchor.columnId);
        if (rowStart < 0 || colStart < 0) return { kind: "no-target" };
        targetRowIds = rowOrder.slice(rowStart, rowStart + sourceRows);
        targetColumnIds = ctx.columnOrder.slice(colStart, colStart + sourceColumns);
        if (targetRowIds.length !== sourceRows || targetColumnIds.length !== sourceColumns) {
            return {
                kind: "shape-mismatch",
                sourceRows,
                sourceColumns,
                targetRows: targetRowIds.length,
                targetColumns: targetColumnIds.length,
            };
        }
    } else {
        targetRowIds = selectedRowIds;
        targetColumnIds = selectedColumnIds;
        const tiles = targetRowIds.length % sourceRows === 0 && targetColumnIds.length % sourceColumns === 0;
        if (!tiles) {
            return {
                kind: "shape-mismatch",
                sourceRows,
                sourceColumns,
                targetRows: targetRowIds.length,
                targetColumns: targetColumnIds.length,
            };
        }
    }

    const writes: GridPasteWrite[] = [];
    for (let i = 0; i < targetRowIds.length; i++) {
        const rowId = targetRowIds[i];
        const rowTarget = ctx.rowTargets.get(rowId);
        const rowWritable = rowTarget && (rowTarget.recordId !== undefined || rowTarget.source !== undefined);
        for (let j = 0; j < targetColumnIds.length; j++) {
            const columnId = targetColumnIds[j];
            if (!rowWritable || !ctx.editableColumns.has(columnId)) continue;
            const raw = source[i % sourceRows]?.[j % sourceColumns] ?? "";
            const value = parseCellValue(ctx, columnId, raw);
            if (!isValueValidForCell(ctx, columnId, value)) return { kind: "invalid-value", rowId, columnId };
            writes.push({ target: { rowTarget: rowTarget!, columnId }, value });
        }
    }
    if (writes.length === 0) return { kind: "no-writable-cells" };
    return { kind: "apply", writes };
}

/**
 * Commits an already-validated paste plan. `id`-addressed writes share a
 * single Yjs transaction (one Undo step, matching `applyValueToSelection`);
 * unioned/source rows are written individually through their own relation.
 */
export function commitGridPaste(
    ctx: Pick<GridCommandContext, "handles" | "session">,
    writes: readonly GridPasteWrite[],
): void {
    const idWrites = writes.filter(write => write.target.rowTarget.recordId !== undefined);
    const sourceWrites = writes.filter(write => write.target.rowTarget.source !== undefined);
    if (idWrites.length > 0) {
        ctx.handles.doc.transact(() => {
            for (const write of idWrites) writeWritableCell(ctx, write.target, write.value);
        });
    }
    for (const write of sourceWrites) writeWritableCell(ctx, write.target, write.value);
}
