import type { GridSelectionSnapshot } from "../../services/yjstable/gridSelection";
import type { MatchPosition, SearchOptions } from "./index";
import { findMatches } from "./index";

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
}

export interface GridSearchSnapshot {
    pageId: string;
    pageTitle: string;
    placementId: string;
    gridId: string;
    columns: readonly string[];
    rows: readonly Record<string, unknown>[];
    selection?: GridSelectionSnapshot;
    rowId(row: Record<string, unknown>): string | undefined;
}

export interface GridSearchProvider {
    snapshot(): GridSearchSnapshot;
    navigate(match: GridCellSearchMatch): void;
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
        for (const row of view.rows) {
            const rowId = view.rowId(row);
            if (!rowId) continue;
            for (const columnId of view.columns) {
                if (selectionOnly && !selectionContains(view.selection, rowId, columnId)) continue;
                const text = gridValueText(row[columnId]);
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

/** One deterministic representation shared by logical Grid Find and future Replace. */
export function gridValueText(value: unknown): string {
    if (value === undefined || value === null) return "";
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

function selectionContains(selection: GridSelectionSnapshot | undefined, rowId: string, columnId: string): boolean {
    if (!selection) return false;
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
