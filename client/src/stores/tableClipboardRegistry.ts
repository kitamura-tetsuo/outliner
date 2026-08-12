// What a mounted Grid can hand to the clipboard, keyed by table id.
//
// The copy path needs the *rendered* view — column order, labels, hidden
// columns and the current result — and that lives in `YjsTableView`, not in the
// engine. Each mounted view registers a source; the copy path calls the getters
// at copy time so they always read live state. A table nobody has rendered has
// no entry, which is exactly the §7 fallback: it copies as its display name.

import type { GridExportConfig } from "../services/clipboard/gridClipboardExport";

export interface TableClipboardSource {
    /** The grid as the user currently sees it, or undefined when nothing is materialized. */
    getGrid: () => GridExportConfig | undefined;
    /** A PNG data URL of the chart view, or undefined when the chart is closed or unrendered. */
    getChartImage: () => string | undefined;
}

const sources = new Map<string, TableClipboardSource>();

export function registerTableClipboardSource(tableId: string, source: TableClipboardSource): void {
    sources.set(tableId, source);
}

export function unregisterTableClipboardSource(tableId: string, source: TableClipboardSource): void {
    // Two views of one table can overlap while the outgoing one is being
    // destroyed; only the registered source may remove itself.
    if (sources.get(tableId) === source) sources.delete(tableId);
}

export function getTableClipboardSource(tableId: string): TableClipboardSource | undefined {
    return sources.get(tableId);
}

/** Test helper: drop every registration so a suite starts from a clean map. */
export function resetTableClipboardSources(): void {
    sources.clear();
}
