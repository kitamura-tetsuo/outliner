import type { PGlite } from "@electric-sql/pglite";

/** Materialize records exactly as the Schedule worker does: every declared
 * schema column is supplied, with absent Yjs fields represented as NULL. */
export async function materializeScheduleRecords(
    db: PGlite,
    schemaName: string,
    tableName: string,
    records: ReadonlyArray<Record<string, unknown>>,
): Promise<void> {
    if (records.length === 0) return;
    const columnsResult = await db.query<{ column_name: string; }>(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
        [schemaName, tableName],
    );
    const columns = columnsResult.rows.map(row => row.column_name);
    if (columns.length === 0) return;
    const values: unknown[] = [];
    const tuples = records.map((record, rowIndex) =>
        `(${
            columns.map((column, columnIndex) => {
                values.push(record[column] !== undefined ? record[column] : null);
                return `$${rowIndex * columns.length + columnIndex + 1}`;
            }).join(",")
        })`
    );
    await db.query(
        `INSERT INTO "${tableName.replace(/"/g, '""')}" (${
            columns.map(column => `"${column.replace(/"/g, '""')}"`).join(",")
        }) VALUES ${tuples.join(",")}`,
        values,
    );
}
