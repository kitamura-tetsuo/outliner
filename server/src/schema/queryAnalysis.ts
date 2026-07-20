// Static analysis of the UI Definition query used to decide grid editability.
//
// Editing rules (per the consolidated table feature):
// - the whole result is read-only when the query has no `id` column, or uses
//   JOINs, aggregation, or grouping;
// - individual columns are read-only when they are not plain columns of the
//   applied schema (calculated/aliased expressions).

import { TableSqlError } from "./pgliteService";
import type { ParsedTableSchema } from "./schemaIntrospection";

export interface QueryEditability {
    /** True when rows may be edited at all. */
    editable: boolean;
    /** Human-readable reason when `editable` is false. */
    readOnlyReason?: string;
    /** Column names (of the result set) that may be edited. */
    editableColumns: Set<string>;
}

function stripSqlNoise(sql: string): string {
    return sql
        .replace(/--[^\n]*/g, " ")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/'(?:[^']|'')*'/g, "''")
        .replace(/"(?:[^"]|"")*"/g, '""');
}

/** Reject anything that is not a single SELECT statement. */
export function assertSelectQuery(sql: string): string {
    const trimmed = (sql ?? "").trim();
    if (!trimmed) throw new TableSqlError("query", "Query is empty");
    const stripped = stripSqlNoise(trimmed);
    if (!/^\s*(select|with)\b/i.test(stripped)) {
        throw new TableSqlError("query", "Only SELECT queries are allowed");
    }
    if (/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i.test(stripped)) {
        throw new TableSqlError("query", "Only read-only SELECT queries are allowed");
    }
    const withoutTrailing = stripped.replace(/;\s*$/, "");
    if (withoutTrailing.includes(";")) {
        throw new TableSqlError("query", "Query must contain exactly one statement");
    }
    return trimmed;
}

const AGGREGATE_RE = /\b(count|sum|avg|min|max|array_agg|string_agg|json_agg|bool_and|bool_or)\s*\(/i;

/**
 * Decide which parts of a query result may be edited, given the query text,
 * the applied schema, and the column names of the result set.
 */
export function analyzeQueryEditability(
    query: string,
    schema: ParsedTableSchema | undefined,
    resultColumns: string[],
): QueryEditability {
    const none = (reason: string): QueryEditability => ({
        editable: false,
        readOnlyReason: reason,
        editableColumns: new Set(),
    });

    if (!schema) return none("No schema applied");
    const stripped = stripSqlNoise(query);

    if (/\bjoin\b/i.test(stripped)) return none("JOIN queries are read-only");
    if (/\bgroup\s+by\b/i.test(stripped)) return none("Aggregated queries are read-only");
    if (AGGREGATE_RE.test(stripped)) return none("Aggregated queries are read-only");
    if (/\bdistinct\b/i.test(stripped)) return none("DISTINCT queries are read-only");
    if (!resultColumns.includes("id")) {
        return none("Query result has no id column");
    }

    const schemaColumns = new Set(schema.columns.map((c) => c.name));
    const editableColumns = new Set<string>();
    for (const column of resultColumns) {
        if (column !== "id" && schemaColumns.has(column)) editableColumns.add(column);
    }
    return { editable: true, editableColumns };
}
