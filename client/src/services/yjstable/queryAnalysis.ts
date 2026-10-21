// Static analysis of the UI Definition query used to decide grid editability.
//
// Editing rules (per the consolidated table feature):
// - the whole result is read-only when the query uses JOINs, aggregation, or
//   grouping, or when its rows carry neither a bare `id` column nor a
//   `source_kind` + `source_id` pair;
// - individual columns are read-only when they are not plain columns of the
//   applied schema (calculated/aliased expressions).
//
// A single-table result is addressed by its own `id` column, tracing back to
// one relation. A query that unions several relations (outline items with
// generated rows, say) has no such single column, but the union can still
// carry row identity that survives the projection: `source_kind` names the
// relation a row came from and `source_id` is that relation's own row
// identity (see docs/crdt-sql-architecture.md §4.4). A write to such a row
// routes to the provider named by `source_kind`, addressing the row by
// `source_id` — see `relationRowWrite.ts`.

import { analyzeDirectSelectProjection } from "$shared/services/directSelectProjection";
import { parseSqlIdentifiers, validateReadOnlySelect } from "$shared/services/readOnlySql";
import { TableSqlError } from "./pgliteService";
import type { ParsedTableSchema } from "./schemaIntrospection";
export { stripSqlNoise } from "$shared/services/readOnlySql";

/** Column carrying the SQL name of the relation a unioned row came from. */
export const SOURCE_KIND_COLUMN = "source_kind";
/** Column carrying that relation's own row identity. */
export const SOURCE_ID_COLUMN = "source_id";

export interface QueryEditability {
    /** True when rows may be edited at all. */
    editable: boolean;
    /** Human-readable reason when `editable` is false. */
    readOnlyReason?: string;
    /** Column names (of the result set) that may be edited. */
    editableColumns: Set<string>;
    /**
     * How an editable row is addressed for a write: `"id"` for the original
     * single-relation case, `"source"` when the row is addressed by its
     * `source_kind` + `source_id` pair. Undefined when the result is
     * read-only.
     */
    rowIdentity?: "id" | "source";
}

export interface BareIdMutationAuthority {
    status: "compatible" | "source-mismatch" | "unavailable";
    editableColumns: Set<string>;
    reason?: string;
}

/** Reject anything that is not a single SELECT statement. */
export function assertSelectQuery(sql: string, requireExplicitAliases = true): string {
    try {
        return validateReadOnlySelect(sql, requireExplicitAliases);
    } catch (error) {
        throw new TableSqlError("query", error instanceof Error ? error.message : String(error));
    }
}

/**
 * Extract the relation name out of Postgres' `relation "x" does not exist`
 * error. Letting the engine report what is missing keeps Postgres the single
 * authority on which relations a query really references — no SQL parsing of
 * our own, so CTEs, aliases and subqueries need no special handling.
 */
export function missingRelationName(err: unknown): string | undefined {
    const message = err instanceof Error ? err.message : String(err ?? "");
    const match = message.match(/relation "([^"]+)" does not exist/i);
    if (!match) return undefined;
    const relation = match[1];
    // Schema-qualified references are never ours to resolve.
    return relation.includes(".") ? undefined : relation;
}

/**
 * Decide which parts of a query result may be edited, given the query text,
 * the applied schema, and the column names of the result set.
 */
export function analyzeQueryEditability(
    query: string,
    schema: ParsedTableSchema | undefined,
    resultColumns: string[],
    bareIdAuthority?: BareIdMutationAuthority,
): QueryEditability {
    const none = (reason: string): QueryEditability => ({
        editable: false,
        readOnlyReason: reason,
        editableColumns: new Set(),
    });

    if (!schema) return none("No schema applied");
    const schemaColumns = schema.columns.map(column => column.name);
    const directColumns = analyzeDirectSelectProjection(query, schemaColumns);

    const hasSourceKind = resultColumns.includes(SOURCE_KIND_COLUMN);
    const hasSourceId = resultColumns.includes(SOURCE_ID_COLUMN);
    if (hasSourceKind !== hasSourceId) {
        return none(
            `Read-only view: a result must carry both ${SOURCE_KIND_COLUMN} and ${SOURCE_ID_COLUMN} `
                + "to keep row identity through a projection",
        );
    }

    const rowIdentity: "id" | "source" | undefined = hasSourceKind && hasSourceId
        ? "source"
        : resultColumns.includes("id")
        ? "id"
        : undefined;
    if (!rowIdentity) {
        return none("Query result has no id column");
    }

    if (rowIdentity === "id" && bareIdAuthority) {
        if (bareIdAuthority.status !== "compatible") {
            return none(bareIdAuthority.reason ?? "Read-only view: query provenance is unavailable");
        }
        return { editable: true, editableColumns: bareIdAuthority.editableColumns, rowIdentity };
    }

    if (rowIdentity === "id" && directColumns.get("id") !== "id") {
        return none("Read-only view: id is not an unmodified source-record identifier");
    }
    if (rowIdentity === "source" && directColumns.get(SOURCE_ID_COLUMN) === undefined) {
        return none("Read-only view: source_id is not an unmodified source-record identifier");
    }
    const schemaColumnSet = new Set(schemaColumns);
    const identityColumns = new Set(["id", SOURCE_KIND_COLUMN, SOURCE_ID_COLUMN]);
    const editableColumns = new Set<string>();
    for (const column of resultColumns) {
        const physical = directColumns.get(column);
        if (!identityColumns.has(column) && physical && schemaColumnSet.has(physical)) editableColumns.add(column);
    }
    return { editable: true, editableColumns, rowIdentity };
}

/**
 * Parses SQL queries into a set of identifiers (lower-cased for unquoted identifiers,
 * exact-case for quoted identifiers), ignoring comments and string literals.
 */
export function parseIdentifiers(sql: string): Set<string> {
    return parseSqlIdentifiers(sql);
}
