import { PGlite } from "@electric-sql/pglite";
import { parentPort } from "node:worker_threads";

async function executeJob(data: any) {
    const { schemaSql, ruleSql, records, timezone, occurrenceUtcIso, ruleId } = data;

    if (typeof ruleId !== "string" || !/^[A-Za-z0-9_-]+$/.test(ruleId)) {
        return { success: false, error: "Invalid ruleId" };
    }
    const pgSchema = `t_${ruleId.replace(/-/g, "_")}`;

    if (timezone) {
        try {
            Intl.DateTimeFormat(undefined, { timeZone: timezone });
        } catch {
            return { success: false, error: "Invalid timezone" };
        }
    }

    const db = new PGlite();
    await db.waitReady;

    try {
        await db.exec(`CREATE SCHEMA "${pgSchema}";`);

        await db.exec(`BEGIN;`);
        await db.exec(`SET LOCAL search_path TO "${pgSchema}";`);
        await db.exec(schemaSql);

        const tablesRes = await db.query<any>(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = $1
        `, [pgSchema]);
        const tableName = tablesRes.rows[0]?.table_name as string;

        if (tableName && records && records.length > 0) {
            const cols = Object.keys(records[0]);

            let query = `INSERT INTO "${tableName}" (${cols.map(c => `"${c.replace(/"/g, '""')}"`).join(",")}) VALUES `;
            const flatValues: any[] = [];
            const values = records.map((record: any, rIdx: number) => {
                const rowPlaceholders = cols.map((c, cIdx) => {
                    const val = record[c];
                    flatValues.push(val);
                    return `$${rIdx * cols.length + cIdx + 1}`;
                });
                return `(${rowPlaceholders.join(",")})`;
            });

            query += values.join(",") + ";";
            await db.query(query, flatValues);
        }

        if (timezone) {
            await db.query(`SELECT set_config('timezone', $1, true);`, [timezone]);
        }
        if (occurrenceUtcIso) {
            await db.query(`SELECT set_config('job.occurrence', $1, true);`, [occurrenceUtcIso]);
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
    } finally {
        await db.close();
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
