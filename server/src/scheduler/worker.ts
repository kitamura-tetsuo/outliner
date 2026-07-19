import { parentPort } from "node:worker_threads";
import { PGlite } from "@electric-sql/pglite";

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
            const cols = Object.keys(records[0]);

            let query = `INSERT INTO "${tableName}" (${cols.map(c => `"${c}"`).join(",")}) VALUES `;
            const values = records.map((record: any) => {
                const rowVals = cols.map(c => {
                    const val = record[c];
                    if (val === null || val === undefined) return "NULL";
                    if (typeof val === "string") return `'${val.replace(/'/g, "''")}'`;
                    if (typeof val === "number" || typeof val === "boolean") return val;
                    return `'${String(val).replace(/'/g, "''")}'`;
                });
                return `(${rowVals.join(",")})`;
            });

            query += values.join(",") + ";";
            await db.exec(query);
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
    } catch (error: any) {
        try { await db.exec("ROLLBACK;"); } catch {}
        return { success: false, error: error.message };
    }
}

parentPort?.on("message", async (msg) => {
    if (msg.type === "execute") {
        try {
            const result = await executeJob(msg.data);
            parentPort?.postMessage({ id: msg.id, result });
        } catch (error: any) {
            parentPort?.postMessage({ id: msg.id, result: { success: false, error: error.message } });
        }
    }
});
