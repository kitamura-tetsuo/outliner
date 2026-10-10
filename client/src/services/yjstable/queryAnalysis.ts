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

import { parseSqlIdentifiers, stripSqlNoise, validateReadOnlySelect } from "$shared/services/readOnlySql";
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

/**
 * Resolve the deliberately small, writable SELECT subset used by bare-id
 * Grids. This is an authority decision, not a general SQL lineage parser:
 * anything it cannot prove is refused. The relation identifier is compared
 * with the primary Table's registered SQL name (which is unique per project).
 */
export function resolveBareIdMutationAuthority(
    query: string,
    primarySqlName: string,
    schema: ParsedTableSchema,
    resultColumns: string[],
): BareIdMutationAuthority {
    const unavailable = (reason: string): BareIdMutationAuthority => ({
        status: "unavailable",
        editableColumns: new Set(),
        reason,
    });
    const sql = stripSqlNoise(query).trim().replace(/;\s*$/, "");
    if (new Set(resultColumns).size !== resultColumns.length) {
        return unavailable("Read-only view: duplicate result column names have ambiguous provenance");
    }
    if (
        /^with\b/i.test(sql) || /\b(union|intersect|except|join|distinct|group\s+by)\b/i.test(sql)
        || AGGREGATE_RE.test(sql)
    ) {
        return unavailable("Read-only view: query provenance is unsupported");
    }
    const select = topLevelSelectAndFrom(sql);
    if (!select) return unavailable("Read-only view: query provenance is unavailable");
    const relation = parseRelation(select.from);
    if (!relation) return unavailable("Read-only view: query source provenance is unavailable");
    if (hasCommaJoinedOuterFrom(select.from)) {
        return unavailable("Read-only view: rows combined from multiple sources cannot be edited here");
    }
    if (relation.name !== primarySqlName) {
        return {
            status: "source-mismatch",
            editableColumns: new Set(),
            reason: `Read-only view: query rows come from "${relation.name}", not the Grid's source Table`,
        };
    }

    const schemaColumns = new Set(schema.columns.map(column => column.name));
    const editableColumns = new Set<string>();
    let provesId = false;
    for (const expression of splitTopLevel(select.projection)) {
        const trimmed = expression.trim();
        if (trimmed === "*") {
            provesId = schemaColumns.has("id");
            for (const column of schemaColumns) if (column !== "id") editableColumns.add(column);
            continue;
        }
        const qualifiedStar = trimmed.match(/^(.+)\.\*$/);
        if (qualifiedStar && isSourceQualifier(qualifiedStar[1], relation)) {
            provesId = schemaColumns.has("id");
            for (const column of schemaColumns) if (column !== "id") editableColumns.add(column);
            continue;
        }
        const column = parsePlainColumn(trimmed, relation);
        if (!column || !resultColumns.includes(column)) continue;
        if (column === "id") provesId = true;
        else if (schemaColumns.has(column)) editableColumns.add(column);
    }
    if (!provesId || !resultColumns.includes("id")) {
        return unavailable("Read-only view: id is not an unmodified source-record identifier");
    }
    return { status: "compatible", editableColumns };
}

function topLevelSelectAndFrom(sql: string): { projection: string; from: string; } | undefined {
    const select = /^select\b/i.exec(sql);
    if (!select) return undefined;
    let depth = 0;
    let quoted = false;
    for (let i = select[0].length; i < sql.length; i++) {
        const char = sql[i];
        if (char === '"') quoted = !quoted;
        if (quoted) continue;
        if (char === "(") depth++;
        else if (char === ")") depth--;
        else if (depth === 0 && /^from\b/i.test(sql.slice(i)) && /\s/.test(sql[i - 1] ?? " ")) {
            return { projection: sql.slice(select[0].length, i), from: sql.slice(i + 4).trim() };
        }
    }
    return undefined;
}

function splitTopLevel(value: string): string[] {
    const parts: string[] = [];
    let start = 0;
    let depth = 0;
    let quoted = false;
    for (let i = 0; i < value.length; i++) {
        const char = value[i];
        if (char === '"') quoted = !quoted;
        else if (!quoted && char === "(") depth++;
        else if (!quoted && char === ")") depth--;
        else if (!quoted && depth === 0 && char === ",") {
            parts.push(value.slice(start, i));
            start = i + 1;
        }
    }
    parts.push(value.slice(start));
    return parts;
}

/**
 * True when the outer FROM clause lists two or more comma-separated sources
 * (`FROM a, b`), which is a cross join that bare-id authority must refuse.
 * Only a top-level comma inside the outer FROM list counts: the input is
 * already `stripSqlNoise` output (quoted values/comments replaced), commas
 * inside parentheses (function arguments, subqueries) are nested, and the
 * scan stops at the clause ending the FROM list so commas in WHERE
 * expressions/subqueries or ORDER BY lists are never separators here.
 */
function hasCommaJoinedOuterFrom(from: string): boolean {
    const name = from.match(/^("(?:[^"]|"")+"|[a-z_][a-z0-9_$]*)/i);
    if (!name) return false;
    let rest = from.slice(name[0].length);
    // Consume at most one alias token (`x`, `AS x`), never a clause keyword,
    // so the scan below starts at the real remainder of the FROM list.
    const alias = /^\s+(?:as\s+)?("(?:[^"]|"")+"|[a-z_][a-z0-9_$]*)/i.exec(rest);
    if (alias) {
        const candidate = /^"/.test(alias[1]!) ? alias[1]! : alias[1]!.toLowerCase();
        if (
            !/^(where|group|having|window|order|limit|offset|fetch|for|join|on|using|union|intersect|except|inner|left|right|full|cross|natural)$/
                .test(candidate)
        ) {
            rest = rest.slice(alias[0].length);
        }
    }
    let depth = 0;
    for (let i = 0; i < rest.length; i++) {
        const char = rest[i]!;
        if (char === "(") depth++;
        else if (char === ")") depth = Math.max(0, depth - 1);
        else if (depth !== 0) continue;
        else if (char === ",") return true;
        else {
            const prev = rest[i - 1];
            if ((i === 0 || !/[a-z0-9_$"]/i.test(prev!)) && FROM_CLAUSE_END_RE.test(rest.slice(i))) {
                return false;
            }
        }
    }
    return false;
}

const FROM_CLAUSE_END_RE =
    /^(where|group\s+by|having|window|order\s+by|limit|offset|fetch|for|join|union|intersect|except)\b/i;

function identifier(value: string): string | undefined {
    const trimmed = value.trim();
    const quoted = trimmed.match(/^"((?:[^"]|"")+)"$/);
    if (quoted) return quoted[1].replace(/""/g, '"');
    return /^[a-z_][a-z0-9_$]*$/i.test(trimmed) ? trimmed.toLowerCase() : undefined;
}

function parseRelation(from: string): { name: string; alias?: string; } | undefined {
    const match = from.match(
        /^("(?:[^"]|"")+"|[a-z_][a-z0-9_$]*)(?:\s+(?:as\s+)?("(?:[^"]|"")+"|[a-z_][a-z0-9_$]*))?/i,
    );
    if (!match) return undefined;
    const name = identifier(match[1]);
    const candidateAlias = match[2] && !/^(where|order|limit|offset)$/i.test(match[2])
        ? identifier(match[2])
        : undefined;
    return name ? { name, alias: candidateAlias } : undefined;
}

function isSourceQualifier(value: string, relation: { name: string; alias?: string; }): boolean {
    const qualifier = identifier(value);
    return qualifier === relation.name || qualifier === relation.alias;
}

function parsePlainColumn(expression: string, relation: { name: string; alias?: string; }): string | undefined {
    // Aliases are calculated/display outputs for authority purposes, even
    // when the expression happens to be a plain column.
    if (/\s+as\s+/i.test(expression)) return undefined;
    const parts = expression.split(".");
    if (parts.length === 1) return identifier(parts[0]);
    if (parts.length === 2 && isSourceQualifier(parts[0], relation)) return identifier(parts[1]);
    return undefined;
}

/** Reject anything that is not a single SELECT statement. */
export function assertSelectQuery(sql: string, requireExplicitAliases = true): string {
    try {
        return validateReadOnlySelect(sql, requireExplicitAliases);
    } catch (error) {
        throw new TableSqlError("query", error instanceof Error ? error.message : String(error));
    }
}

const AGGREGATE_RE = /\b(count|sum|avg|min|max|array_agg|string_agg|json_agg|bool_and|bool_or)\s*\(/i;

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
    const stripped = stripSqlNoise(query);

    if (/\bjoin\b/i.test(stripped)) {
        return none("Read-only view: rows combined from several tables cannot be edited here");
    }
    if (/\bgroup\s+by\b/i.test(stripped)) {
        return none("Read-only view: aggregated rows have no single source record to edit");
    }
    if (AGGREGATE_RE.test(stripped)) {
        return none("Read-only view: aggregated rows have no single source record to edit");
    }
    if (/\bdistinct\b/i.test(stripped)) return none("DISTINCT queries are read-only");

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

    // A comma-joined outer FROM list is a cross join even without the JOIN
    // keyword. Bare-id rows from combined sources have no single record to
    // address, so they stay read-only with or without an authority verdict.
    if (rowIdentity === "id") {
        const from = topLevelSelectAndFrom(stripped.trim())?.from;
        if (from !== undefined && hasCommaJoinedOuterFrom(from)) {
            return none("Read-only view: rows combined from several tables cannot be edited here");
        }
    }

    if (rowIdentity === "id" && bareIdAuthority) {
        if (bareIdAuthority.status !== "compatible") {
            return none(bareIdAuthority.reason ?? "Read-only view: query provenance is unavailable");
        }
        return { editable: true, editableColumns: bareIdAuthority.editableColumns, rowIdentity };
    }

    const schemaColumns = new Set(schema.columns.map((c) => c.name));
    const identityColumns = new Set(["id", SOURCE_KIND_COLUMN, SOURCE_ID_COLUMN]);
    const editableColumns = new Set<string>();
    for (const column of resultColumns) {
        if (!identityColumns.has(column) && schemaColumns.has(column)) editableColumns.add(column);
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
