// Schema Definition handling for Yjs tables.
//
// A table's schema is a single CREATE TABLE statement (plain text in the
// table subdoc). It is never parsed by hand: the statement is executed against
// a throwaway PGlite schema and the resulting columns / types / constraints
// are read back from information_schema and pg_catalog, so the accepted
// grammar is exactly what Postgres accepts.

import { enqueueWrite, TableSqlError, toTableSqlError } from "./pgliteService";

/** Normalized column value kind used for strict casting of Yjs record values. */
export type ColumnKind =
    | "text"
    | "integer"
    | "number"
    | "boolean"
    | "date"
    | "timestamp"
    | "other";

export interface TableColumnSchema {
    name: string;
    /** Raw data_type from information_schema.columns (e.g. "integer", "text"). */
    dataType: string;
    /** Normalized kind used for casting and cell component defaults. */
    kind: ColumnKind;
    isNullable: boolean;
    isPrimaryKey: boolean;
    /**
     * Allowed values extracted from a `CHECK (col IN (...))` constraint.
     * `select` cell components read their options from here, never from the
     * UI Definition.
     */
    checkOptions?: string[];
}

export interface ParsedTableSchema {
    tableName: string;
    columns: TableColumnSchema[];
    /** The validated CREATE TABLE statement (trimmed). */
    createSql: string;
}

export interface SchemaDiff {
    addedColumns: string[];
    removedColumns: string[];
    typeChangedColumns: { name: string; from: string; to: string; }[];
}

export function columnKindFromDataType(dataType: string): ColumnKind {
    const t = dataType.toLowerCase();
    if (t === "boolean") return "boolean";
    if (t === "smallint" || t === "integer" || t === "bigint") return "integer";
    if (
        t === "numeric" || t === "real" || t === "double precision" || t === "money"
    ) return "number";
    if (t === "date") return "date";
    if (t.startsWith("timestamp")) return "timestamp";
    if (t === "text" || t.startsWith("character") || t === "uuid" || t.includes("char")) return "text";
    return "other";
}

/**
 * Reject anything that is not a single CREATE TABLE statement before it ever
 * reaches the engine. Comments and string/identifier literals are stripped
 * first so semicolons inside them do not count as statement separators.
 */
export function assertSingleCreateTable(sql: string): string {
    const trimmed = (sql ?? "").trim();
    if (!trimmed) {
        throw new TableSqlError("schema", "Schema definition is empty");
    }
    const stripped = trimmed
        .replace(/--[^\n]*/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/'(?:[^']|'')*'/g, "''")
        .replace(/"(?:[^"]|"")*"/g, '""');
    if (!/^\s*create\s+table\b/i.test(stripped)) {
        throw new TableSqlError("schema", "Schema definition must be a single CREATE TABLE statement");
    }
    const withoutTrailing = stripped.replace(/;\s*$/, "");
    if (withoutTrailing.includes(";")) {
        throw new TableSqlError("schema", "Schema definition must contain exactly one statement");
    }
    if (/^\s*create\s+table\s+[^(\s]+\./i.test(stripped)) {
        throw new TableSqlError("schema", "Schema-qualified table names are not supported");
    }
    return trimmed;
}

/**
 * Extract the allowed literal values from a Postgres CHECK constraint
 * definition when it has the shape produced by `CHECK (col IN (...))`
 * (Postgres normalizes IN lists to `= ANY (ARRAY[...])`).
 * Returns the referenced column name and its options, or undefined for any
 * other kind of CHECK expression.
 */
export function extractCheckInOptions(
    constraintDef: string,
): { column: string; options: string[]; } | undefined {
    if (!/=\s*ANY\s*\(/i.test(constraintDef)) return undefined;
    const columnMatch = constraintDef.match(/CHECK\s*\(+\s*(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/i);
    const column = columnMatch?.[1] ?? columnMatch?.[2];
    if (!column) return undefined;
    const arrayMatch = constraintDef.match(/ARRAY\s*\[([\s\S]*?)\]/i);
    if (!arrayMatch) return undefined;
    const options: string[] = [];
    const literalRe = /'((?:[^']|'')*)'/g;
    let m: RegExpExecArray | null;
    while ((m = literalRe.exec(arrayMatch[1])) !== null) {
        options.push(m[1].replace(/''/g, "'"));
    }
    return options.length > 0 ? { column, options } : undefined;
}

let validationCounter = 0;

/**
 * Validate a CREATE TABLE statement by executing it in a throwaway PGlite
 * schema, then introspect the created table. The scratch schema is always
 * dropped, so the shared engine state used by live tables is never affected.
 */
export async function parseCreateTable(sql: string): Promise<ParsedTableSchema> {
    const createSql = assertSingleCreateTable(sql);
    const scratchSchema = `__yjstable_validate_${++validationCounter}__`;

    return enqueueWrite(async (db) => {
        try {
            await db.exec(
                `DROP SCHEMA IF EXISTS "${scratchSchema}" CASCADE;`
                    + `CREATE SCHEMA "${scratchSchema}";`,
            );
            try {
                await db.exec(
                    `BEGIN; SET LOCAL search_path TO "${scratchSchema}"; ${createSql}; COMMIT;`,
                );
            } catch (err) {
                // A failed statement leaves the session in an aborted
                // transaction; end it so cleanup and later writes still work.
                try {
                    await db.exec("ROLLBACK;");
                } catch {
                    // no transaction to roll back
                }
                throw err;
            }
            return await introspectTable(db, scratchSchema, createSql);
        } catch (err) {
            throw toTableSqlError("schema", err);
        } finally {
            try {
                await db.exec(`DROP SCHEMA IF EXISTS "${scratchSchema}" CASCADE;`);
            } catch {
                // scratch cleanup is best-effort
            }
        }
    });
}

interface PgliteLike {
    query: <T>(sql: string, params?: unknown[]) => Promise<{ rows: T[]; }>;
    exec: (sql: string) => Promise<unknown>;
}

async function introspectTable(
    db: PgliteLike,
    schema: string,
    createSql: string,
): Promise<ParsedTableSchema> {
    const tables = await db.query<{ table_name: string; }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = $1",
        [schema],
    );
    if (tables.rows.length !== 1) {
        throw new TableSqlError(
            "schema",
            "Schema definition must create exactly one table",
        );
    }
    const tableName = tables.rows[0].table_name;

    const columns = await db.query<{
        column_name: string;
        data_type: string;
        is_nullable: string;
    }>(
        "SELECT column_name, data_type, is_nullable FROM information_schema.columns "
            + "WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position",
        [schema, tableName],
    );
    if (columns.rows.length === 0) {
        throw new TableSqlError("schema", "Table must define at least one column");
    }

    const pk = await db.query<{ column_name: string; }>(
        "SELECT kcu.column_name FROM information_schema.table_constraints tc "
            + "JOIN information_schema.key_column_usage kcu "
            + "ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema "
            + "WHERE tc.table_schema = $1 AND tc.table_name = $2 AND tc.constraint_type = 'PRIMARY KEY'",
        [schema, tableName],
    );
    const pkColumns = new Set(pk.rows.map((r) => r.column_name));

    const checks = await db.query<{ def: string; }>(
        "SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c "
            + "JOIN pg_class t ON t.oid = c.conrelid "
            + "JOIN pg_namespace n ON n.oid = t.relnamespace "
            + "WHERE n.nspname = $1 AND t.relname = $2 AND c.contype = 'c'",
        [schema, tableName],
    );
    const optionsByColumn = new Map<string, string[]>();
    for (const row of checks.rows) {
        const parsed = extractCheckInOptions(row.def);
        if (parsed) optionsByColumn.set(parsed.column, parsed.options);
    }

    return {
        tableName,
        createSql,
        columns: columns.rows.map((row) => ({
            name: row.column_name,
            dataType: row.data_type,
            kind: columnKindFromDataType(row.data_type),
            isNullable: row.is_nullable !== "NO",
            isPrimaryKey: pkColumns.has(row.column_name),
            checkOptions: optionsByColumn.get(row.column_name),
        })),
    };
}

/**
 * Compare a previously applied schema with a newly parsed one. Removed columns
 * and type changes are destructive for existing Data Storage records; callers
 * must confirm them with the user before applying.
 */
export function diffSchemas(prev: ParsedTableSchema | undefined, next: ParsedTableSchema): SchemaDiff {
    const diff: SchemaDiff = { addedColumns: [], removedColumns: [], typeChangedColumns: [] };
    if (!prev) {
        diff.addedColumns = next.columns.map((c) => c.name);
        return diff;
    }
    const prevByName = new Map(prev.columns.map((c) => [c.name, c]));
    const nextByName = new Map(next.columns.map((c) => [c.name, c]));
    for (const col of next.columns) {
        const before = prevByName.get(col.name);
        if (!before) {
            diff.addedColumns.push(col.name);
        } else if (before.dataType !== col.dataType) {
            diff.typeChangedColumns.push({ name: col.name, from: before.dataType, to: col.dataType });
        }
    }
    for (const col of prev.columns) {
        if (!nextByName.has(col.name)) diff.removedColumns.push(col.name);
    }
    return diff;
}
