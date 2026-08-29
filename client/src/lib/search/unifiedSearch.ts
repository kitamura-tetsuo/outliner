import type { GridSelectionSnapshot } from "../../services/yjstable/gridSelection";
import type { MatchPosition, SearchOptions } from "./index";
import { buildRegExp, findMatches } from "./index";

export type UnifiedSearchMatch = TextItemSearchMatch | GridCellSearchMatch;

export interface TextItemSearchMatch {
    kind: "text-item";
    pageId: string;
    itemId: string;
    text: string;
    range: MatchPosition;
    pageTitle: string;
}

export interface GridCellSearchMatch {
    kind: "grid-cell";
    pageId: string;
    placementId: string;
    gridId: string;
    rowId: string;
    columnId: string;
    text: string;
    range: MatchPosition;
    pageTitle: string;
    /**
     * Whether this hit is a direct mutation target (a writable source cell),
     * as opposed to a computed/join/read-only cell that stays searchable but
     * is never a Replace target (FTR-5194). Text-item hits have no equivalent
     * flag: their only replace guard is the page-title `skipRoot` option.
     */
    replaceable: boolean;
}

export interface GridSearchSnapshot {
    pageId: string;
    pageTitle: string;
    placementId: string;
    gridId: string;
    columns: readonly string[];
    rows: readonly Record<string, unknown>[];
    selection?: GridSelectionSnapshot;
    rowId(row: Record<string, unknown>, rowIndex: number): string | undefined;
}

/** One Replace target: `newText` is the cell's full display text after the substitution, ready to be re-typed and validated. */
export interface GridCellReplacement {
    rowId: string;
    columnId: string;
    newText: string;
}

export interface GridCellReplaceOutcome extends GridCellReplacement {
    applied: boolean;
    /** Set when `applied` is false: the cell was never a writable target, or `newText` has no deterministic, valid typed value. */
    reason?: "read-only" | "invalid-value";
}

export interface GridSearchProvider {
    snapshot(): GridSearchSnapshot;
    navigate(match: GridCellSearchMatch): void;
    clearHighlight(): void;
    /** Cheap, side-effect-free replaceability check -- lets the UI distinguish total matches from replaceable ones without mutating anything. */
    isCellReplaceable(rowId: string, columnId: string): boolean;
    /**
     * Applies every entry's `newText`, re-typed and validated per column.
     * `id`-addressed rows are written in one Yjs transaction (one Undo step);
     * a rejected entry (read-only, or no valid conversion) is left completely
     * unmutated rather than blocking the rest of the batch.
     */
    replaceCells(entries: readonly GridCellReplacement[]): GridCellReplaceOutcome[];
}

const providers = new Map<string, GridSearchProvider>();

export function registerGridSearchProvider(provider: GridSearchProvider): () => void {
    const key = provider.snapshot().placementId;
    providers.set(key, provider);
    return () => {
        if (providers.get(key) === provider) providers.delete(key);
    };
}

export function gridSearchMatches(
    pageId: string,
    query: string,
    options: SearchOptions,
    selectionOnly = false,
): GridCellSearchMatch[] {
    const matches: GridCellSearchMatch[] = [];
    for (const provider of providers.values()) {
        const view = provider.snapshot();
        if (view.pageId !== pageId) continue;
        for (const [rowIndex, row] of view.rows.entries()) {
            const rowId = view.rowId(row, rowIndex);
            if (!rowId) continue;
            for (const columnId of view.columns) {
                if (selectionOnly && !selectionContains(view.selection, rowId, columnId)) continue;
                const text = gridValueText(row[columnId]);
                const replaceable = provider.isCellReplaceable(rowId, columnId);
                for (const range of findMatches(text, query, options)) {
                    matches.push({
                        kind: "grid-cell",
                        pageId,
                        pageTitle: view.pageTitle,
                        placementId: view.placementId,
                        gridId: view.gridId,
                        rowId,
                        columnId,
                        text,
                        range,
                        replaceable,
                    });
                }
            }
        }
    }
    return matches;
}

export function navigateGridSearchMatch(match: GridCellSearchMatch): void {
    providers.get(match.placementId)?.navigate(match);
}

export function clearGridSearchHighlights(): void {
    for (const provider of providers.values()) provider.clearHighlight();
}

/**
 * Replaces one already-located Grid match's cell (the "Replace current"
 * command). Re-reads the cell's live value from the provider instead of
 * trusting `match.text`, since it may be stale by the time the user acts on
 * it. Returns `undefined` only when the match's placement is no longer
 * registered (its Grid unmounted between Find and Replace).
 */
export function replaceGridMatch(
    match: GridCellSearchMatch,
    query: string,
    replacement: string,
    options: SearchOptions,
): GridCellReplaceOutcome | undefined {
    const provider = providers.get(match.placementId);
    if (!provider) return undefined;
    const view = provider.snapshot();
    const row = view.rows.find((candidate, index) => view.rowId(candidate, index) === match.rowId);
    const currentText = row ? gridValueText(row[match.columnId]) : match.text;
    const newText = currentText.replace(buildRegExp(query, options), replacement);
    const [outcome] = provider.replaceCells([{ rowId: match.rowId, columnId: match.columnId, newText }]);
    return outcome;
}

export interface GridReplaceAllOutcome {
    /** Cells actually rewritten. */
    appliedCells: number;
    /** Hits that were searchable but never a mutation target (computed/join/read-only cells). */
    skippedReadOnly: number;
    /** Hits whose substituted text has no deterministic, schema-valid typed value for that column. */
    skippedInvalid: number;
}

/**
 * Replace All for Grid cells on one page. Deduplicates by the cell's
 * underlying identity (`gridId` + row + column) so a Grid placed more than
 * once on the page is written exactly once per matching cell, even though
 * Find exposes every visible placement (FTR-5194). Each provider's matching
 * cells are batched into one `replaceCells` call so `id`-addressed rows share
 * one Undo step; a cell whose substitution fails validation is left
 * unmutated instead of blocking the rest of the page.
 */
export function replaceGridMatches(
    pageId: string,
    query: string,
    replacement: string,
    options: SearchOptions,
    selectionOnly = false,
): GridReplaceAllOutcome {
    const outcome: GridReplaceAllOutcome = { appliedCells: 0, skippedReadOnly: 0, skippedInvalid: 0 };
    if (!query) return outcome;
    const regex = buildRegExp(query, options);
    const seenCells = new Set<string>();
    const byProvider = new Map<GridSearchProvider, GridCellReplacement[]>();
    for (const provider of providers.values()) {
        const view = provider.snapshot();
        if (view.pageId !== pageId) continue;
        for (const [rowIndex, row] of view.rows.entries()) {
            const rowId = view.rowId(row, rowIndex);
            if (!rowId) continue;
            for (const columnId of view.columns) {
                if (selectionOnly && !selectionContains(view.selection, rowId, columnId)) continue;
                const dedupeKey = `${view.gridId}:${rowId}:${columnId}`;
                if (seenCells.has(dedupeKey)) continue;
                const text = gridValueText(row[columnId]);
                if (findMatches(text, query, options).length === 0) continue;
                seenCells.add(dedupeKey);
                const entries = byProvider.get(provider) ?? [];
                entries.push({ rowId, columnId, newText: text.replace(regex, replacement) });
                byProvider.set(provider, entries);
            }
        }
    }
    for (const [provider, entries] of byProvider) {
        for (const result of provider.replaceCells(entries)) {
            if (result.applied) outcome.appliedCells++;
            else if (result.reason === "invalid-value") outcome.skippedInvalid++;
            else outcome.skippedReadOnly++;
        }
    }
    return outcome;
}

/** One deterministic representation shared by logical Grid Find and Replace. */
export function gridValueText(value: unknown): string {
    if (value === undefined || value === null) return "";
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

function selectionContains(selection: GridSelectionSnapshot | undefined, rowId: string, columnId: string): boolean {
    if (!selection) return false;
    if (
        selection.regions.some(region =>
            region.kind === "include-cells"
            && region.rowIds.includes(rowId)
            && region.columnIds.includes(columnId)
        )
    ) return true;
    const included = selection.regions.some(region => {
        if (region.kind === "all") return true;
        if (region.kind === "rows") return region.rowIds.includes(rowId);
        if (region.kind === "columns") return region.columnIds.includes(columnId);
        return (region.kind === "cells" || region.kind === "include-cells")
            && region.rowIds.includes(rowId) && region.columnIds.includes(columnId);
    });
    if (!included) return false;
    return !selection.regions.some(region =>
        (region.kind === "exclude-rows" && region.rowIds.includes(rowId))
        || (region.kind === "exclude-columns" && region.columnIds.includes(columnId))
        || (region.kind === "exclude-cells" && region.rowIds.includes(rowId) && region.columnIds.includes(columnId))
    );
}
