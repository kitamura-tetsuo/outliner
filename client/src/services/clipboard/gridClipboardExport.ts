// Outward serialization of a rendered Grid result (docs/grid-clipboard-spec.md §7).
//
// Outside Outliner there is no database to point at, so what travels is what
// the user sees: the current query result with the view's column order, column
// labels and hidden columns already applied. The caller supplies `columns` in
// the order the grid renders them (`orderColumns`), so this module never has to
// know about the UI Definition.

/** Rows past this are dropped; a hundred thousand rows must not enter the system clipboard. */
export const GRID_EXPORT_ROW_LIMIT = 2000;

export interface GridExportConfig {
    /** Column names in the order the grid renders them, hidden ones included. */
    columns: string[];
    hiddenColumns: Record<string, boolean>;
    labels: Record<string, string | undefined>;
    rows: Record<string, unknown>[];
    rowLimit?: number;
}

/** Truncation is never silent: the notice travels with the trimmed result. */
function truncationNotice(kept: number, total: number): string {
    return `--- Copy limit reached: first ${kept} of ${total} rows ---`;
}

const RFC_4180_NEEDS_QUOTING = /[\t\r\n"]/;

/**
 * SQL NULL and the empty string are different values a TSV cannot tell apart;
 * both become an empty cell. §7.1 accepts the ambiguity — this is a one-way
 * export and nothing later has to invert it.
 */
function formatTsvCell(value: unknown): string {
    if (value === null || value === undefined) return "";
    const str = String(value);
    if (RFC_4180_NEEDS_QUOTING.test(str)) return `"${str.replaceAll('"', '""')}"`;
    return str;
}

export function escapeHtml(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

/** Cell boundaries are elements here, so only markup characters need escaping. */
function formatHtmlCell(value: unknown): string {
    if (value === null || value === undefined) return "";
    return escapeHtml(String(value)).replaceAll("\n", "<br>");
}

/** Presentation label for a column, matching `TableGrid.headerLabel`. */
function headerLabel(config: GridExportConfig, column: string): string {
    const label = config.labels[column];
    return label !== undefined && label !== "" ? label : column;
}

function visibleColumnsOf(config: GridExportConfig): string[] {
    return config.columns.filter(column => config.hiddenColumns[column] !== true);
}

function keptRowsOf(config: GridExportConfig): { rows: Record<string, unknown>[]; truncated: boolean; } {
    const limit = config.rowLimit ?? GRID_EXPORT_ROW_LIMIT;
    if (config.rows.length <= limit) return { rows: config.rows, truncated: false };
    return { rows: config.rows.slice(0, limit), truncated: true };
}

/** The universal spreadsheet contract: a header row of labels, then one line per row. */
export function serializeGridToTsv(config: GridExportConfig): { text: string; truncated: boolean; } {
    const columns = visibleColumnsOf(config);
    const { rows, truncated } = keptRowsOf(config);

    const lines = [columns.map(column => formatTsvCell(headerLabel(config, column))).join("\t")];
    for (const row of rows) {
        lines.push(columns.map(column => formatTsvCell(row[column])).join("\t"));
    }
    if (truncated) lines.push(truncationNotice(rows.length, config.rows.length));

    return { text: lines.join("\n"), truncated };
}

/** A real `<table>`: Word, Google Docs, Notion and Excel all prefer this flavor. */
export function serializeGridToHtml(config: GridExportConfig): { html: string; truncated: boolean; } {
    const columns = visibleColumnsOf(config);
    const { rows, truncated } = keptRowsOf(config);

    const parts = ["<table>", "  <thead>", "    <tr>"];
    for (const column of columns) {
        parts.push(`      <th>${formatHtmlCell(headerLabel(config, column))}</th>`);
    }
    parts.push("    </tr>", "  </thead>", "  <tbody>");
    for (const row of rows) {
        parts.push("    <tr>");
        for (const column of columns) {
            parts.push(`      <td>${formatHtmlCell(row[column])}</td>`);
        }
        parts.push("    </tr>");
    }
    parts.push("  </tbody>", "</table>");
    if (truncated) {
        parts.push(`<p><i>${escapeHtml(truncationNotice(rows.length, config.rows.length))}</i></p>`);
    }

    return { html: parts.join("\n"), truncated };
}
