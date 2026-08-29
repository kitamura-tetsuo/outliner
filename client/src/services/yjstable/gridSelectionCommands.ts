// Selection-aware bulk Grid editing commands (FTR-5191).
//
// A single logical Grid selection (`GridSelection`) can mean several very
// different things depending on how it was made: a rectangular cell/range
// drag, one or more whole rows picked from the row header, one or more whole
// columns picked from the column header, or the entire query result via
// "select all". Keyboard, mouse, touch, clipboard, and Replace all need the
// *same* answer for "what does Delete/Backspace do to this selection?" and
// "what cells may this bulk edit actually touch?" — this module is that
// shared answer, kept independent of any input device or Svelte component so
// every caller reuses one validated mutation path instead of re-implementing
// it.
//
// Read-only/computed cells and rows without a durable write identity (a new,
// unsaved row placeholder, or a query result that isn't editable at all) stay
// selectable for copy/navigation but are never mutation targets: they are
// simply excluded from every command's target list.

import type { GridSelection, GridSelectionRegion } from "./gridSelection";
import { applyUnionedRowDelete, applyUnionedRowEdit, type RelationResolver } from "./relationRowWrite";
import { deleteRecord, setRecordValue, type TableHandles, type TableRecordValue } from "./tableDocs";

/** The four selection shapes a Grid selection's regions can describe. */
export type GridSelectionKind = "none" | "rows" | "columns" | "cells" | "all";

/**
 * Classifies a selection's regions into one of the four shapes above.
 * `GridSelection`'s own mutators always reset `regions` wholesale for
 * `selectRow`/`selectColumn`/`selectAll` (see `gridSelection.ts`), so at any
 * point exactly one shape family is present — a plain cell/range selection,
 * or the `include-cells`/`exclude-cells` toggle refinements of one.
 */
export function classifySelectionKind(regions: readonly GridSelectionRegion[]): GridSelectionKind {
    if (regions.length === 0) return "none";
    if (regions.some(region => region.kind === "all")) return "all";
    if (regions.some(region => region.kind === "rows" || region.kind === "exclude-rows")) return "rows";
    if (regions.some(region => region.kind === "columns" || region.kind === "exclude-columns")) return "columns";
    return "cells";
}

/** How a selected row is written back: a plain Table record, or a unioned/relation row addressed by source. */
export interface GridCommandRowTarget {
    row: Record<string, unknown>;
    recordId?: string;
    source?: { sourceKind: string; sourceId: string; };
}

/** Whether a row target has anywhere to write at all. Rows without either are display-only (e.g. an unsaved placeholder). */
function isWritableRow(target: GridCommandRowTarget): boolean {
    return target.recordId !== undefined || target.source !== undefined;
}

/** The value-shape families a cell's rendered component accepts, mirroring `CellComponentType`. */
export type GridCellValueKind = "text" | "number" | "checkbox" | "select" | "date";

export interface GridCommandContext {
    handles: TableHandles;
    session: RelationResolver;
    /** One entry per row currently in the query result, keyed by the same logical row id `GridSelection` uses. */
    rowTargets: ReadonlyMap<string, GridCommandRowTarget>;
    /** Columns the selection may span (the Grid's visible, ordered columns). */
    columnOrder: readonly string[];
    /** Columns writable by the current query — already excludes identity/read-only columns (see `analyzeQueryEditability`). */
    editableColumns: ReadonlySet<string>;
    valueKindOf: (columnId: string) => GridCellValueKind;
    checkOptionsOf: (columnId: string) => readonly string[] | undefined;
}

export interface GridWritableCellTarget {
    rowTarget: GridCommandRowTarget;
    columnId: string;
}

export interface GridSelectionSummary {
    kind: GridSelectionKind;
    /** Every selected cell, writable or not — for UI status text ("12 cells selected · 9 editable"). */
    totalCells: number;
    /** The subset of selected cells this command layer may actually mutate. */
    writableTargets: GridWritableCellTarget[];
}

/** Resolves a selection down to concrete cell targets, without mutating anything. */
export function summarizeSelection(selection: GridSelection, ctx: GridCommandContext): GridSelectionSummary {
    const kind = classifySelectionKind(selection.regions);
    let totalCells = 0;
    const writableTargets: GridWritableCellTarget[] = [];
    for (const [rowId, rowTarget] of ctx.rowTargets) {
        const rowWritable = isWritableRow(rowTarget);
        for (const columnId of ctx.columnOrder) {
            if (!selection.contains({ rowId, columnId })) continue;
            totalCells++;
            if (rowWritable && ctx.editableColumns.has(columnId)) {
                writableTargets.push({ rowTarget, columnId });
            }
        }
    }
    return { kind, totalCells, writableTargets };
}

/**
 * Whether `value` is a valid, non-coercing fit for a cell of `columnId`'s
 * type. `null` always clears any writable cell. Deliberately strict — a
 * bulk command must never silently coerce `"3"` into `3`, or a stray string
 * into a checkbox — see FTR-5191 "avoid surprising type coercion".
 */
export function isValueValidForCell(
    ctx: Pick<GridCommandContext, "valueKindOf" | "checkOptionsOf">,
    columnId: string,
    value: TableRecordValue,
): boolean {
    if (value === null) return true;
    switch (ctx.valueKindOf(columnId)) {
        case "checkbox":
            return typeof value === "boolean";
        case "number":
            return typeof value === "number" && Number.isFinite(value);
        case "select": {
            if (typeof value !== "string") return false;
            const options = ctx.checkOptionsOf(columnId);
            return !options || options.length === 0 || options.includes(value);
        }
        case "date":
        case "text":
            return typeof value === "string";
    }
}

export interface GridCommandOutcome {
    applied: boolean;
    /** Set when `applied` is false, naming why nothing was written. */
    reason?: "no-writable-cells" | "invalid-value";
    /** Cells actually written, when `applied` is true. */
    count?: number;
}

function writeWritableCell(
    ctx: Pick<GridCommandContext, "handles" | "session">,
    target: GridWritableCellTarget,
    value: TableRecordValue,
): void {
    const { rowTarget, columnId } = target;
    if (rowTarget.recordId !== undefined) {
        setRecordValue(ctx.handles, rowTarget.recordId, columnId, value);
        return;
    }
    if (rowTarget.source) {
        void applyUnionedRowEdit(ctx.session, rowTarget.source.sourceKind, rowTarget.source.sourceId, columnId, value);
    }
}

/**
 * Applies `value` to every writable cell in the selection as one coherent
 * action. Every target is validated against its column type first — if any
 * one is incompatible, nothing is written at all (no partial mutation of the
 * selection). `id`-addressed rows share a single Yjs transaction, so they
 * collapse to one Undo step; unioned/source rows are written through their
 * own relation and cannot share that transaction.
 */
export function applyValueToSelection(
    selection: GridSelection,
    ctx: GridCommandContext,
    value: TableRecordValue,
): GridCommandOutcome {
    const { writableTargets } = summarizeSelection(selection, ctx);
    if (writableTargets.length === 0) return { applied: false, reason: "no-writable-cells" };
    for (const target of writableTargets) {
        if (!isValueValidForCell(ctx, target.columnId, value)) {
            return { applied: false, reason: "invalid-value" };
        }
    }
    const idTargets = writableTargets.filter(target => target.rowTarget.recordId !== undefined);
    const sourceTargets = writableTargets.filter(target => target.rowTarget.source !== undefined);
    if (idTargets.length > 0) {
        ctx.handles.doc.transact(() => {
            for (const target of idTargets) writeWritableCell(ctx, target, value);
        });
    }
    for (const target of sourceTargets) writeWritableCell(ctx, target, value);
    return { applied: true, count: writableTargets.length };
}

/** Clears every writable selected cell's content to `NULL` (the default Delete/Backspace behavior outside a `rows` selection). */
export function clearSelectionToNull(selection: GridSelection, ctx: GridCommandContext): GridCommandOutcome {
    return applyValueToSelection(selection, ctx, null);
}

/** Row targets for every row a `rows`-kind (or `all`-kind) selection covers. */
export function collectSelectedRowTargets(
    selection: GridSelection,
    ctx: Pick<GridCommandContext, "rowTargets">,
): GridCommandRowTarget[] {
    const targets: GridCommandRowTarget[] = [];
    for (const [rowId, target] of ctx.rowTargets) {
        if (selection.containsRow(rowId)) targets.push(target);
    }
    return targets;
}

/**
 * Removes every given row target. `id`-addressed rows share a single Yjs
 * transaction (one Undo step); unioned/source rows are removed through their
 * own relation, one write each, exactly like a single-row delete.
 */
export function removeRowTargets(
    ctx: Pick<GridCommandContext, "handles" | "session">,
    targets: readonly GridCommandRowTarget[],
): void {
    const recordIds = targets.flatMap(target => target.recordId !== undefined ? [target.recordId] : []);
    if (recordIds.length > 0) {
        ctx.handles.doc.transact(() => {
            for (const recordId of recordIds) deleteRecord(ctx.handles, recordId);
        });
    }
    for (const target of targets) {
        if (target.source) void applyUnionedRowDelete(ctx.session, target.source.sourceKind, target.source.sourceId);
    }
}

export type GridDeleteCommandPlan =
    /** A `rows`-kind selection: the caller decides whether to confirm, then calls `removeRowTargets`. */
    | { kind: "remove-rows"; targets: GridCommandRowTarget[]; }
    /** Any other selection kind: already executed — cell contents were cleared to `NULL`. */
    | { kind: "clear-cells"; outcome: GridCommandOutcome; };

/**
 * The selection-aware Delete/Backspace command. A `rows`-kind selection
 * removes records — the caller must apply the per-Grid "confirm before
 * deleting rows" option before calling `removeRowTargets`. Every other kind
 * (a cell/range, a column selection, or the whole result via "select all")
 * clears writable cell contents instead: a whole-result selection must never
 * implicitly become a destructive whole-result record removal.
 */
export function planGridDeleteCommand(selection: GridSelection, ctx: GridCommandContext): GridDeleteCommandPlan {
    if (classifySelectionKind(selection.regions) === "rows") {
        return { kind: "remove-rows", targets: collectSelectedRowTargets(selection, ctx) };
    }
    return { kind: "clear-cells", outcome: clearSelectionToNull(selection, ctx) };
}
