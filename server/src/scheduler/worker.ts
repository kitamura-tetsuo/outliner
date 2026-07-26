import { PGlite } from "@electric-sql/pglite";
import { parentPort } from "node:worker_threads";

let db: PGlite | null = null;

async function executeJob(data: any) {
    if (!db) {
        db = new PGlite();
        await db.waitReady;
    }

    const { schemaSql, ruleSql, records, timezone, occurrenceUtcIso, ruleId } = data;
    const pgSchema = `t_${ruleId.replace(/-/g, "_")}`;

    try {
        await db.exec(`DROP SCHEMA IF EXISTS "${pgSchema}" CASCADE;`);
        await db.exec(`CREATE SCHEMA "${pgSchema}";`);

        await db.exec(`BEGIN;`);
        await db.exec(`SET LOCAL search_path TO "${pgSchema}";`);
        await db.exec(schemaSql);

        const tablesRes = await db.query<any>(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = '${pgSchema}'
        `);
        const tableName = tablesRes.rows[0]?.table_name as string;

        if (tableName && records && records.length > 0) {
            const colsRes = await db.query<any>(`
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = '${pgSchema}' AND table_name = '${tableName}'
            `);
            const cols = colsRes.rows.map(r => r.column_name as string);

            if (cols.length > 0) {
                const insertSql = `INSERT INTO "${tableName}" (${cols.map(c => `"${c}"`).join(",")}) VALUES (${
                    cols.map((_, i) => `$${i + 1}`).join(",")
                })`;

                for (const record of records) {
                    const values = cols.map(c => {
                        const val = record[c];
                        if (val === undefined) return null;
                        return val;
                    });
                    await db.query(insertSql, values);
                }
            }
        }

        if (timezone) {
            await db.exec(`SET LOCAL TIME ZONE '${timezone}';`);
        }
        if (occurrenceUtcIso) {
            await db.exec(`SELECT set_config('job.occurrence', '${occurrenceUtcIso}', true);`);
        }

        const result = await db.query(ruleSql);
        await db.exec(`COMMIT;`);
        return { success: true, rows: result.rows };
    } catch (error: unknown) {
        try {
            await db.exec("ROLLBACK;");
        } catch {}
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMessage };
    }
}

parentPort?.on("message", async (msg) => {
    if (msg.type === "execute") {
        try {
            const result = await executeJob(msg.data);
            parentPort?.postMessage({ id: msg.id, result });
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            parentPort?.postMessage({ id: msg.id, result: { success: false, error: errorMessage } });
        }
    }
});
