// Schema Definition handling for Yjs tables.
//
// A table's schema is a single CREATE TABLE statement (plain text in the
// table subdoc). It is never parsed by hand: the statement is executed against
// a throwaway PGlite schema and the resulting columns / types / constraints
// are read back from information_schema and pg_catalog, so the accepted
// grammar is exactly what Postgres accepts.

import { loadModule, parseSync } from "libpg-query";
import { enqueueWrite, TableSqlError, toTableSqlError } from "./pgliteService";

await loadModule();

/** Normalized column value kind used for strict casting of Yjs record values. */
export type ColumnKind =
    | "text"
    | "integer"
    | "number"
    | "boolean"
    | "date"
    | "timestamp"
    | "enum"
    | "other";

export interface TableColumnSchema {
    name: string;
    /** Raw data_type from information_schema.columns (e.g. "integer", "text"). */
    dataType: string;
    /** Normalized kind used for casting and cell component defaults. */
    kind: ColumnKind;
    isNullable: boolean;
    isPrimaryKey: boolean;
    /** PostgreSQL's bound for CHAR/VARCHAR fields, when declared. */
    characterMaximumLength?: number;
    /** PostgreSQL's normalized DEFAULT expression, when the field has one. */
    defaultExpression?: string;
    /** Engine-resolved value for a statically proved scalar DEFAULT. */
    literalDefault?:
        | { status: "literal"; value: string | number | boolean | null; }
        | { status: "unsupported"; diagnostic?: string; };
    /** True when PostgreSQL applies at least one CHECK constraint to this field. */
    hasCheckConstraint?: boolean;
    /**
     * Allowed values extracted from a `CHECK (col IN (...))` constraint.
     * `select` cell components read their options from here, never from the
     * UI Definition.
     */
    checkOptions?: string[];
    /** Exact pg_enum declaration-order labels for a scalar ENUM column. */
    enumLabels?: string[];
}

export interface ParsedTableSchema {
    tableName: string;
    columns: TableColumnSchema[];
    /** The validated CREATE TABLE statement (trimmed). */
    createSql: string;
    /** CHECK expressions not completely represented by the extracted choices. */
    hasUnsupportedInsertCheck?: boolean;
    /** The Yjs-first INSERT writer cannot publish generated field values. */
    hasGeneratedColumns?: boolean;
    /** Additional UNIQUE constraints need a validity proof this action does not provide. */
    hasAdditionalUniqueConstraint?: boolean;
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
 * reaches the engine. PostgreSQL's AST owns grammar and statement boundaries,
 * including comments and punctuation inside literals.
 */
export function assertSingleCreateTable(sql: string): string {
    const trimmed = (sql ?? "").trim();
    if (!trimmed) throw new TableSqlError("schema", "Schema definition is empty");
    try {
        const parsed = parseSync(trimmed) as { stmts?: { stmt?: Record<string, unknown>; }[]; };
        if (parsed.stmts?.length !== 1) throw new Error("Schema definition must contain exactly one statement");
        const create = parsed.stmts[0]?.stmt?.CreateStmt as Record<string, unknown> | undefined;
        const relation = create?.relation as Record<string, unknown> | undefined;
        if (!create || !relation) throw new Error("Schema definition must be a single ordinary CREATE TABLE statement");
        if (create.if_not_exists === true) throw new Error("CREATE TABLE IF NOT EXISTS is not supported");
        if (relation.schemaname || relation.catalogname) {
            throw new Error("Schema-qualified table names are not supported");
        }
        if (relation.relpersistence !== "p") throw new Error("Temporary and unlogged tables are not supported");
    } catch (error) {
        throw new TableSqlError("schema", error instanceof Error ? error.message : "Invalid CREATE TABLE statement");
    }
    return trimmed;
}

function node(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
}

function selectExpression(expression: string): unknown {
    const parsed = parseSync(`SELECT ${expression}`) as { stmts?: { stmt?: Record<string, unknown>; }[]; };
    if (parsed.stmts?.length !== 1) return undefined;
    const select = node(parsed.stmts[0]?.stmt?.SelectStmt);
    const targets = select?.targetList;
    if (!Array.isArray(targets) || targets.length !== 1 || select.fromClause || select.whereClause) return undefined;
    return node(node(targets[0])?.ResTarget)?.val;
}

/**
 * Extract the allowed literal values from a Postgres CHECK constraint
 * definition when it has the shape produced by `CHECK (col IN (...))`
 * (Postgres normalizes IN lists to `= ANY (ARRAY[...])`).
 * Returns the referenced column name and its options, or undefined for any
 * other kind of CHECK expression.
 */
export function extractCheckInOptions(
    expression: string,
): { column: string; options: string[]; } | undefined {
    try {
        const expr = node(node(selectExpression(expression))?.A_Expr);
        const names = expr?.name;
        if (
            expr?.kind !== "AEXPR_OP_ANY" || !Array.isArray(names) || names.length !== 1
            || node(node(names[0])?.String)?.sval !== "="
        ) {
            return undefined;
        }
        const fields = node(node(expr.lexpr)?.ColumnRef)?.fields;
        if (!Array.isArray(fields) || fields.length !== 1) return undefined;
        const column = node(node(fields[0])?.String)?.sval;
        if (typeof column !== "string") return undefined;
        const elements = node(node(expr.rexpr)?.A_ArrayExpr)?.elements;
        if (!Array.isArray(elements) || elements.length === 0) return undefined;
        const options: string[] = [];
        for (const element of elements) {
            const cast = node(node(element)?.TypeCast);
            const typeNames = node(cast?.typeName)?.names;
            const lastTypeName = Array.isArray(typeNames) ? node(node(typeNames.at(-1))?.String)?.sval : undefined;
            const constant = node(node(cast?.arg)?.A_Const);
            const value = node(constant?.sval)?.sval;
            if (!constant || constant.isnull || lastTypeName !== "text" || typeof value !== "string") {
                return undefined;
            }
            options.push(value);
        }
        return { column, options };
    } catch {
        return undefined;
    }
}

function isStaticLiteralExpression(expression: string): boolean {
    try {
        const visit = (value: unknown): boolean => {
            const current = node(value);
            if (current?.A_Const) return true;
            const cast = node(current?.TypeCast);
            if (cast) return visit(cast.arg);
            const op = node(current?.A_Expr);
            const names = op?.name;
            const operator = Array.isArray(names) ? node(node(names[0])?.String)?.sval : undefined;
            return op?.kind === "AEXPR_OP" && Array.isArray(names) && names.length === 1
                && (operator === "+" || operator === "-") && !op.lexpr && visit(op.rexpr);
        };
        return visit(selectExpression(expression));
    } catch {
        return false;
    }
}

let validationCounter = 0;

/**
 * Validate a CREATE TABLE statement by executing it in a throwaway PGlite
 * schema, then introspect the created table. The scratch schema is always
 * dropped, so the shared engine state used by live tables is never affected.
 */
export async function parseCreateTable(
    sql: string,
    catalogSources: readonly string[] = [],
): Promise<ParsedTableSchema> {
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
                    `BEGIN; SET LOCAL search_path TO "${scratchSchema}"; `
                        + catalogSources.join(";\n") + `;\n${createSql}; COMMIT;`,
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

export async function introspectTable(
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
        typtype: string;
        enum_labels: string[];
        column_default: string | null;
        character_maximum_length: number | null;
        is_generated: string;
    }>(
        "SELECT c.column_name, c.data_type, c.is_nullable, c.column_default, c.character_maximum_length, c.is_generated, t.typtype, "
            + "ARRAY(SELECT e.enumlabel FROM pg_enum e WHERE e.enumtypid=t.oid ORDER BY e.enumsortorder) AS enum_labels "
            + "FROM information_schema.columns c JOIN pg_namespace n ON n.nspname=c.udt_schema "
            + "JOIN pg_type t ON t.typnamespace=n.oid AND t.typname=c.udt_name "
            + "WHERE c.table_schema = $1 AND c.table_name = $2 ORDER BY c.ordinal_position",
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
    const uniqueConstraints = await db.query<{ constraint_name: string; }>(
        "SELECT constraint_name FROM information_schema.table_constraints "
            + "WHERE table_schema = $1 AND table_name = $2 AND constraint_type = 'UNIQUE'",
        [schema, tableName],
    );

    const checks = await db.query<{ expression: string; columns: string[]; }>(
        "SELECT pg_get_expr(c.conbin, c.conrelid) AS expression, "
            + "ARRAY(SELECT a.attname FROM pg_attribute a WHERE a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)) AS columns "
            + "FROM pg_constraint c "
            + "JOIN pg_class t ON t.oid = c.conrelid "
            + "JOIN pg_namespace n ON n.oid = t.relnamespace "
            + "WHERE n.nspname = $1 AND t.relname = $2 AND c.contype = 'c'",
        [schema, tableName],
    );
    const optionsByColumn = new Map<string, string[]>();
    const checkedColumns = new Set<string>();
    const unsupportedColumns = new Set<string>();
    let hasUnsupportedInsertCheck = false;
    for (const row of checks.rows) {
        for (const column of row.columns) checkedColumns.add(column);
        const parsed = extractCheckInOptions(row.expression);
        const catalogColumn = parsed && columns.rows.find(column => column.column_name === parsed.column);
        if (
            !parsed || row.columns.length !== 1 || row.columns[0] !== parsed.column
            || catalogColumn?.data_type !== "text"
            || optionsByColumn.has(parsed.column) || unsupportedColumns.has(parsed.column)
        ) {
            hasUnsupportedInsertCheck = true;
            for (const column of row.columns) {
                optionsByColumn.delete(column);
                unsupportedColumns.add(column);
            }
            continue;
        }
        optionsByColumn.set(parsed.column, parsed.options);
    }

    const literalDefaults = new Map<string, TableColumnSchema["literalDefault"]>();
    for (const row of columns.rows) {
        if (row.column_default === null) continue;
        const kind = row.typtype === "e" ? "enum" : columnKindFromDataType(row.data_type);
        if (!isStaticLiteralExpression(row.column_default) || kind === "other") {
            literalDefaults.set(row.column_name, {
                status: "unsupported",
                diagnostic: "DEFAULT is not a supported scalar literal",
            });
            continue;
        }
        try {
            const resolved = await db.query<{ value: unknown; }>(`SELECT (${row.column_default}) AS value`);
            const value = resolved.rows[0]?.value;
            let normalized: string | number | boolean | null | undefined;
            if (value === null) normalized = null;
            else if (typeof value === "string" || typeof value === "boolean") normalized = value;
            else if (typeof value === "number" && Number.isFinite(value)) normalized = value;
            else if (value instanceof Date && !Number.isNaN(value.valueOf())) normalized = value.toISOString();
            literalDefaults.set(
                row.column_name,
                normalized === undefined ? { status: "unsupported" } : { status: "literal", value: normalized },
            );
        } catch (error) {
            literalDefaults.set(row.column_name, { status: "unsupported", diagnostic: String(error) });
        }
    }

    return {
        tableName,
        createSql,
        hasUnsupportedInsertCheck,
        hasGeneratedColumns: columns.rows.some(column => column.is_generated !== "NEVER"),
        hasAdditionalUniqueConstraint: uniqueConstraints.rows.length > 0,
        columns: columns.rows.map((row) => ({
            name: row.column_name,
            dataType: row.data_type,
            kind: row.typtype === "e" ? "enum" : columnKindFromDataType(row.data_type),
            isNullable: row.is_nullable !== "NO",
            isPrimaryKey: pkColumns.has(row.column_name),
            ...(row.character_maximum_length !== null ? { characterMaximumLength: row.character_maximum_length } : {}),
            defaultExpression: row.column_default ?? undefined,
            literalDefault: literalDefaults.get(row.column_name),
            hasCheckConstraint: checkedColumns.has(row.column_name),
            checkOptions: optionsByColumn.get(row.column_name),
            enumLabels: row.typtype === "e" ? row.enum_labels : undefined,
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
