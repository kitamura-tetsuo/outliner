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
 * `String.prototype.replace`'s string form interprets `$&`, `$1`, ... as
 * substitution patterns; the outline's own `replaceFirst`/`replaceAll`
 * (`lib/search/index.ts`) deliberately route the replacement through a
 * callback so it lands literally. Grid replacement must use the same policy
 * so one unified Replace All does not expand `$`-tokens only on the Grid
 * side of a mixed text+Grid page (FTR-5194).
 */
function replaceLiteral(text: string, regex: RegExp, replacement: string): string {
    return text.replace(regex, () => replacement);
}

/** One already-mutated Grid cell, carrying enough identity to patch a held match list without waiting on that Grid's own (debounced) query refresh. */
export interface GridCellReplaceDetail {
    placementId: string;
    gridId: string;
    rowId: string;
    columnId: string;
    newText: string;
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
): (GridCellReplaceOutcome & GridCellReplaceDetail) | undefined {
    const provider = providers.get(match.placementId);
    if (!provider) return undefined;
    const view = provider.snapshot();
    const row = view.rows.find((candidate, index) => view.rowId(candidate, index) === match.rowId);
    const currentText = row ? gridValueText(row[match.columnId]) : match.text;
    const newText = replaceLiteral(currentText, buildRegExp(query, options), replacement);
    const [outcome] = provider.replaceCells([{ rowId: match.rowId, columnId: match.columnId, newText }]);
    return outcome && { ...outcome, placementId: match.placementId, gridId: match.gridId };
}

export interface GridReplaceAllOutcome {
    /** Cells actually rewritten. */
    appliedCells: number;
    /** Hits that were searchable but never a mutation target (computed/join/read-only cells). */
    skippedReadOnly: number;
    /** Hits whose substituted text has no deterministic, schema-valid typed value for that column. */
    skippedInvalid: number;
    /** Every cell actually rewritten, for patching a held match list synchronously (see `applyGridReplaceToMatches`). */
    applied: GridCellReplaceDetail[];
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
    const outcome: GridReplaceAllOutcome = { appliedCells: 0, skippedReadOnly: 0, skippedInvalid: 0, applied: [] };
    if (!query) return outcome;
    const regex = buildRegExp(query, options);
    const seenCells = new Set<string>();
    const byProvider = new Map<
        GridSearchProvider,
        { placementId: string; gridId: string; entries: GridCellReplacement[]; }
    >();
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
                const providerEntry = byProvider.get(provider)
                    ?? { placementId: view.placementId, gridId: view.gridId, entries: [] };
                providerEntry.entries.push({ rowId, columnId, newText: replaceLiteral(text, regex, replacement) });
                byProvider.set(provider, providerEntry);
            }
        }
    }
    for (const [provider, { placementId, gridId, entries }] of byProvider) {
        for (const result of provider.replaceCells(entries)) {
            if (result.applied) {
                outcome.appliedCells++;
                outcome.applied.push({
                    placementId,
                    gridId,
                    rowId: result.rowId,
                    columnId: result.columnId,
                    newText: result.newText,
                });
            } else if (result.reason === "invalid-value") outcome.skippedInvalid++;
            else outcome.skippedReadOnly++;
        }
    }
    return outcome;
}

/**
 * Patches a held unified match list in place for cells already rewritten by
 * `replaceGridMatch`/`replaceGridMatches`, instead of re-deriving them from
 * the Grid's query result -- which refreshes from a debounced PGlite
 * re-query and would otherwise still show the pre-replace value immediately
 * after the write (AGENTS.md section 11: prefer a synchronous update over a
 * timer or re-poll). Every old entry for a rewritten cell is removed and replaced
 * with however many matches its new text actually has (zero if the
 * replacement cleared the query, more than one if the query still recurs).
 */
export function applyGridReplaceToMatches(
    matches: readonly UnifiedSearchMatch[],
    replaced: readonly GridCellReplaceDetail[],
    pageId: string,
    pageTitle: string,
    query: string,
    options: SearchOptions,
): UnifiedSearchMatch[] {
    if (replaced.length === 0) return [...matches];
    const cellKey = (placementId: string, rowId: string, columnId: string) => `${placementId}:${rowId}:${columnId}`;
    const byCell = new Map(replaced.map(cell => [cellKey(cell.placementId, cell.rowId, cell.columnId), cell]));
    const patched = new Set<string>();
    const result: UnifiedSearchMatch[] = [];
    for (const m of matches) {
        if (m.kind !== "grid-cell") {
            result.push(m);
            continue;
        }
        const key = cellKey(m.placementId, m.rowId, m.columnId);
        const cell = byCell.get(key);
        if (!cell) {
            result.push(m);
            continue;
        }
        if (patched.has(key)) continue; // Already re-expanded this cell once; drop the rest of its stale entries.
        patched.add(key);
        for (const range of findMatches(cell.newText, query, options)) {
            result.push({
                kind: "grid-cell",
                pageId,
                pageTitle,
                placementId: cell.placementId,
                gridId: cell.gridId,
                rowId: cell.rowId,
                columnId: cell.columnId,
                text: cell.newText,
                range,
                replaceable: m.replaceable,
            });
        }
    }
    // A cell rewritten via Replace All may not have had a stale entry in
    // `matches` at all yet (Replace All can run without a prior Search), so
    // append any it didn't already patch.
    for (const cell of replaced) {
        const key = cellKey(cell.placementId, cell.rowId, cell.columnId);
        if (patched.has(key)) continue;
        patched.add(key);
        for (const range of findMatches(cell.newText, query, options)) {
            result.push({
                kind: "grid-cell",
                pageId,
                pageTitle,
                placementId: cell.placementId,
                gridId: cell.gridId,
                rowId: cell.rowId,
                columnId: cell.columnId,
                text: cell.newText,
                range,
                replaceable: true,
            });
        }
    }
    return result;
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
