import { getLogger } from "../lib/logger";
import { type ColumnMeta, getPGlite } from "./pgliteService";

const logger = getLogger("schemaParser");

export interface TableConstraint {
    type: string;
    expression?: string;
    options?: string[]; // for CHECK (col IN (...)) constraints
}

export interface IntrospectedColumn extends ColumnMeta {
    isPrimaryKey: boolean;
    isNullable: boolean;
    defaultValue: string | null;
    constraints: TableConstraint[];
}

export interface SchemaValidationResult {
    isValid: boolean;
    errorMessage?: string;
    columns: IntrospectedColumn[];
    tableName: string;
}

export interface SchemaChangeWarning {
    type: "column_deleted" | "type_changed";
    columnName: string;
    details: string;
}

// Generates a temporary schema name to avoid polluting the main database
const generateTempSchemaName = () => `temp_${Math.random().toString(36).substring(2, 9)}`;

export async function parseCreateTable(sql: string): Promise<SchemaValidationResult> {
    const pg = await getPGlite();
    const tempSchema = generateTempSchemaName();
    let tableName = "unknown_table";

    try {
        // Attempt to extract the table name roughly, using a regex
        const tableNameMatch = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)/i);
        if (tableNameMatch) {
            tableName = tableNameMatch[1].replace(/["']/g, "");
        }

        // 1. Create a temporary schema and set search path
        await pg.query(`CREATE SCHEMA IF NOT EXISTS ${tempSchema};`);
        await pg.query(`SET search_path TO ${tempSchema};`);

        // 2. Execute the DDL in the temp schema
        await pg.query(sql);

        // 3. Introspect the created table
        const columns = await introspectTable(pg, tempSchema, tableName);

        return {
            isValid: true,
            columns,
            tableName,
        };
    } catch (err) {
        logger.error({ sql, err }, "Error parsing CREATE TABLE");
        return {
            isValid: false,
            errorMessage: err instanceof Error ? err.message : String(err),
            columns: [],
            tableName,
        };
    } finally {
        // Clean up temporary schema
        try {
            await pg.query(`SET search_path TO public;`);
            await pg.query(`DROP SCHEMA IF EXISTS ${tempSchema} CASCADE;`);
        } catch (cleanupErr) {
            logger.warn({ cleanupErr }, "Failed to clean up temporary schema");
        }
    }
}

async function introspectTable(
    pg: import("@electric-sql/pglite").PGlite,
    schemaName: string,
    tableName: string,
): Promise<IntrospectedColumn[]> {
    const columns: IntrospectedColumn[] = [];

    // Query information_schema for columns
    const columnsRes = await pg.query(
        `
        SELECT
            column_name,
            data_type,
            is_nullable,
            column_default
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position;
    `,
        [schemaName, tableName],
    );

    // Query for Primary Keys
    const pkRes = await pg.query(
        `
        SELECT a.attname as column_name
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = $1::regclass AND i.indisprimary;
    `,
        [`${schemaName}.${tableName}`],
    );
    const pkColumns = new Set((pkRes.rows as Record<string, unknown>[]).map(row => row.column_name as string));

    // Query for Check constraints (attempt to parse options)
    const checkRes = await pg.query(
        `
        SELECT
            con.conname,
            pg_get_constraintdef(con.oid) AS constraint_def,
            a.attname AS column_name
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = connamespace
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
        WHERE nsp.nspname = $1 AND rel.relname = $2 AND con.contype = 'c';
    `,
        [schemaName, tableName],
    );

    for (const row of columnsRes.rows as Record<string, unknown>[]) {
        const colName = row.column_name as string;
        const colConstraints: TableConstraint[] = [];

        // Find relevant check constraints for this column
        const colChecks = (checkRes.rows as Record<string, unknown>[]).filter(c => c.column_name === colName);
        for (const check of colChecks) {
            const def = check.constraint_def as string; // e.g. "CHECK ((status = ANY (ARRAY['todo'::text, 'done'::text])))"
            // Simple regex to find IN (...) or ANY (ARRAY[...]) lists of strings
            const optionsMatch = def.match(/ARRAY\[(.*?)\]/i) || def.match(/IN\s*\((.*?)\)/i);

            let options: string[] | undefined;
            if (optionsMatch) {
                // Extract strings like 'todo'::text into 'todo'
                options = optionsMatch[1]
                    .split(",")
                    .map((s: string) => {
                        const m = s.trim().match(/'([^']+)'/);
                        return m ? m[1] : undefined;
                    })
                    .filter(Boolean) as string[];
            }

            if (options && options.length > 0) {
                colConstraints.push({ type: "CHECK", expression: def, options });
            } else {
                colConstraints.push({ type: "CHECK", expression: def });
            }
        }

        columns.push({
            name: colName,
            type: row.data_type as string,
            isNullable: row.is_nullable === "YES",
            isPrimaryKey: pkColumns.has(colName),
            defaultValue: row.column_default as string | null,
            constraints: colConstraints,
        });
    }

    return columns;
}

export function validateSchemaChange(
    oldCols: IntrospectedColumn[],
    newCols: IntrospectedColumn[],
): SchemaChangeWarning[] {
    const warnings: SchemaChangeWarning[] = [];
    const newColMap = new Map(newCols.map(c => [c.name, c]));

    for (const oldCol of oldCols) {
        const newCol = newColMap.get(oldCol.name);

        if (!newCol) {
            warnings.push({
                type: "column_deleted",
                columnName: oldCol.name,
                details: `Column '${oldCol.name}' was removed. Data for this column will be lost if you apply.`,
            });
        } else if (oldCol.type !== newCol.type) {
            warnings.push({
                type: "type_changed",
                columnName: oldCol.name,
                details:
                    `Column '${oldCol.name}' changed type from ${oldCol.type} to ${newCol.type}. Data might be lost or truncated if it cannot be cast.`,
            });
        }
    }

    return warnings;
}
