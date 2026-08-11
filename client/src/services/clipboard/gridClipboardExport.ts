export interface GridExportConfig {
    columns: string[];
    hiddenColumns: Record<string, boolean>;
    labels: Record<string, string | undefined>;
    rows: Record<string, unknown>[];
    rowLimit?: number;
}

const RFC_4180_NEEDS_QUOTING = /[\t\r\n"]/;

function formatTsvCell(value: unknown): string {
    if (value === null || value === undefined || value === "") return "";
    const str = String(value);
    if (RFC_4180_NEEDS_QUOTING.test(str)) {
        return `"${str.replaceAll('"', '""')}"`;
    }
    return str;
}

function escapeHtml(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function formatHtmlCell(value: unknown): string {
    if (value === null || value === undefined || value === "") return "";
    const str = String(value);
    return escapeHtml(str).replaceAll("\n", "<br>");
}

export function serializeGridToTsv(config: GridExportConfig): { text: string; truncated: boolean; } {
    const visibleColumns = config.columns.filter(c => !config.hiddenColumns[c]);
    const limit = config.rowLimit ?? 2000;

    let text = visibleColumns.map(c => formatTsvCell(config.labels[c] ?? c)).join("\t");

    const rows = config.rows;
    let truncated = false;
    let count = 0;

    for (const row of rows) {
        if (count >= limit) {
            truncated = true;
            break;
        }
        text += "\n" + visibleColumns.map(c => formatTsvCell(row[c])).join("\t");
        count++;
    }

    if (truncated) {
        text += "\n--- Copy limit reached ---";
    }

    return { text, truncated };
}

export function serializeGridToHtml(config: GridExportConfig): { html: string; truncated: boolean; } {
    const visibleColumns = config.columns.filter(c => !config.hiddenColumns[c]);
    const limit = config.rowLimit ?? 2000;

    let html = "<table>\n";
    html += "  <thead>\n    <tr>\n";
    for (const c of visibleColumns) {
        html += `      <th>${formatHtmlCell(config.labels[c] ?? c)}</th>\n`;
    }
    html += "    </tr>\n  </thead>\n";
    html += "  <tbody>\n";

    const rows = config.rows;
    let truncated = false;
    let count = 0;

    for (const row of rows) {
        if (count >= limit) {
            truncated = true;
            break;
        }
        html += "    <tr>\n";
        for (const c of visibleColumns) {
            html += `      <td>${formatHtmlCell(row[c])}</td>\n`;
        }
        html += "    </tr>\n";
        count++;
    }

    html += "  </tbody>\n</table>";

    if (truncated) {
        html += "\n<p><i>--- Copy limit reached ---</i></p>";
    }

    return { html, truncated };
}
