// Schema Definition handling for Yjs tables.
// Adapted for server from client/src/services/yjstable/schemaIntrospection.ts

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
    dataType: string;
    kind: ColumnKind;
    isNullable: boolean;
    isPrimaryKey: boolean;
    checkOptions?: string[];
}

export interface ParsedTableSchema {
    tableName: string;
    columns: TableColumnSchema[];
    createSql: string;
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

export function assertSingleCreateTable(sql: string): string {
    const trimmed = (sql ?? "").trim();
    if (!trimmed) {
        throw new Error("Schema definition is empty");
    }
    const stripped = trimmed
        .replace(/--[^\n]*/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/'(?:[^']|'')*'/g, "''")
        .replace(/"(?:[^"]|"")*"/g, '""');
    if (!/^\s*create\s+table\b/i.test(stripped)) {
        throw new Error("Schema definition must be a single CREATE TABLE statement");
    }
    const withoutTrailing = stripped.replace(/;\s*$/, "");
    if (withoutTrailing.includes(";")) {
        throw new Error("Schema definition must contain exactly one statement");
    }
    if (/^\s*create\s+table\s+[^(\s]+\./i.test(stripped)) {
        throw new Error("Schema-qualified table names are not supported");
    }
    return trimmed;
}

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
        throw new Error("Schema definition must create exactly one table");
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
        throw new Error("Table must define at least one column");
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
