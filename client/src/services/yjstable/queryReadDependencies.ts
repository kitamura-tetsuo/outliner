import { loadModule, parseSync } from "libpg-query";
import type * as Y from "yjs";
import { listTables } from "./tableDocs";

await loadModule();

export interface QueryReadDependencies {
    status: "complete" | "unknown";
    tableIds: string[];
    relationNames: string[];
    diagnostics: string[];
}

/** Inventory stored queries without mounting or executing a view. Preferences
 * and result suppliers are deliberately outside this read-only evidence. */
export function queryReadDependencies(doc: Y.Doc, query: string): QueryReadDependencies {
    const result: QueryReadDependencies = { status: "complete", tableIds: [], relationNames: [], diagnostics: [] };
    const unknown = (reason: string) => {
        result.status = "unknown";
        result.diagnostics.push(reason);
    };
    try {
        const parsed = parseSync(query) as { stmts?: { stmt?: Record<string, unknown>; }[]; };
        if (parsed.stmts?.length !== 1 || !parsed.stmts[0]?.stmt?.SelectStmt) {
            unknown("Read inventory requires one SELECT statement");
            return result;
        }
        const containsWith = (value: unknown): boolean =>
            !!value && typeof value === "object"
            && (Array.isArray(value)
                ? value.some(containsWith)
                : "withClause" in value || "WithClause" in value || Object.values(value).some(containsWith));
        if (containsWith(parsed)) {
            unknown("CTE read inventory requires scoped relation resolution");
            return result;
        }
        const tables = listTables(doc);
        const visit = (value: unknown) => {
            if (!value || typeof value !== "object") return;
            if (Array.isArray(value)) {
                value.forEach(visit);
                return;
            }
            const node = value as Record<string, unknown>;
            // A CTE requires scoped name resolution. Preserve known references,
            // but do not certify an automatic closure from partial evidence.
            if (node.withClause || node.WithClause) unknown("CTE read inventory is unavailable");
            if (node.RangeFunction || node.RangeTableFunc) unknown("Function relation read inventory is unavailable");
            if (node.RangeVar) {
                const range = node.RangeVar as { relname: string; schemaname?: string; catalogname?: string; };
                const name = range.relname;
                if (!result.relationNames.includes(name)) result.relationNames.push(name);
                if (range.schemaname || range.catalogname) unknown(`Qualified relation "${name}" cannot be resolved`);
                else if (name !== "outline_items") {
                    const matches = tables.filter(table => table.sqlName === name);
                    if (matches.length !== 1) unknown(`Relation "${name}" is missing or ambiguous`);
                    else if (!result.tableIds.includes(matches[0]!.tableId)) result.tableIds.push(matches[0]!.tableId);
                }
            }
            Object.values(node).forEach(visit);
        };
        visit(parsed.stmts[0]!.stmt);
    } catch (error) {
        unknown(error instanceof Error ? error.message : "Query parsing failed");
    }
    return result;
}
