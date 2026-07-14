import { getSqlStatic } from "./sqlService";

/**
 * A single column definition derived from a CREATE TABLE statement.
 */
export interface TableColumn {
    name: string;
    type: string;
    /** True when the column participates in the table's PRIMARY KEY. */
    pk: boolean;
}

/**
 * Result of parsing a CREATE TABLE statement.
 */
export interface ParsedTableSchema {
    tableName: string;
    columns: TableColumn[];
}

/**
 * Parse (and validate) a SQL `CREATE TABLE` statement.
 *
 * The statement is executed against an isolated, in-memory sql.js database so
 * that the full SQLite DDL grammar is supported. Column metadata is then read
 * back via `PRAGMA table_info`, guaranteeing the parsed schema matches what
 * SQLite itself would create. The temporary database is discarded afterwards so
 * the shared query database used elsewhere is never affected.
 *
 * @throws Error when the SQL is empty, is not a CREATE TABLE statement, or is
 *   rejected by SQLite.
 */
export async function parseCreateTable(sql: string): Promise<ParsedTableSchema> {
    const trimmed = (sql ?? "").trim();
    if (!trimmed) {
        throw new Error("SQL statement is empty");
    }
    if (!/^create\s+table\b/i.test(trimmed)) {
        throw new Error("Only a single CREATE TABLE statement is supported");
    }

    const SQL = await getSqlStatic();
    const tempDb = new SQL.Database();
    try {
        tempDb.exec(trimmed);

        // Resolve the created table name from sqlite_master rather than trusting
        // a regex, so quoted / schema-qualified identifiers are handled correctly.
        const nameResult = tempDb.exec(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY rowid DESC LIMIT 1",
        );
        const tableName = nameResult[0]?.values?.[0]?.[0];
        if (typeof tableName !== "string" || tableName.length === 0) {
            throw new Error("CREATE TABLE statement did not produce a table");
        }

        const info = tempDb.exec(`PRAGMA table_info("${tableName.replace(/"/g, '""')}")`);
        const rows = info[0]?.values ?? [];
        // PRAGMA table_info columns: cid, name, type, notnull, dflt_value, pk
        const columns: TableColumn[] = rows.map((row) => ({
            name: String(row[1]),
            type: String(row[2] ?? ""),
            pk: Number(row[5] ?? 0) > 0,
        }));

        if (columns.length === 0) {
            throw new Error("Table must define at least one column");
        }

        return { tableName, columns };
    } finally {
        try {
            tempDb.close();
        } catch {
            // ignore close failures on the throwaway database
        }
    }
}
