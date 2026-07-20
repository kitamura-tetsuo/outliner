// @ts-nocheck
import { parentPort } from "worker_threads";
import { PGlite } from "@electric-sql/pglite";

let pg: PGlite | null = null;

async function getPg() {
    if (!pg) {
        pg = new PGlite("memory://");
        await pg.waitReady;
    }
    return pg;
}

parentPort?.on("message", async (message: any) => {
    try {
        const db = await getPg();
        if (message.type === "EXECUTE_JOB") {
            const { schemaSql, records, ruleSql, timezone, occurrenceIso, ruleId } = message;

            let returningRows: any[] = [];
            let error: string | undefined;

            const tableNameMatch = schemaSql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:['"]?([^'"\s(]+)['"]?|([^\s(]+))/i);
            const tableName = tableNameMatch ? (tableNameMatch[1] || tableNameMatch[2]) : null;

            try {
                // Execute everything outside explicit BEGIN/ROLLBACK, drop schema ensures cleanup
                await db.query('CREATE SCHEMA throwaway');
                await db.query('SET search_path TO throwaway');

                await db.query(schemaSql);

                if (records.length > 0 && tableName) {
                    const keys = Object.keys(records[0]);
                    const params: any[] = [];
                    const valuesStrs: string[] = [];

                    let paramIdx = 1;
                    for (const record of records) {
                        const valStr = [];
                        for (const key of keys) {
                            valStr.push(`$${paramIdx++}`);
                            const val = record[key];
                            params.push(val === undefined ? null : val);
                        }
                        valuesStrs.push(`(${valStr.join(', ')})`);
                    }

                    const escapedKeys = keys.map((k: string) => `"${k}"`).join(', ');
                    const insertSql = `INSERT INTO "${tableName}" (${escapedKeys}) VALUES ${valuesStrs.join(', ')}`;
                    await db.query(insertSql, params);
                }

                await db.query(`SET TIME ZONE '${timezone}'`);
                await db.query(`SELECT set_config('job.occurrence', '${occurrenceIso}', false)`);

                const result = await db.query(ruleSql);
                returningRows = result.rows;
            } catch (err: any) {
                error = err.message;
            } finally {
                await db.query('DROP SCHEMA IF EXISTS throwaway CASCADE').catch(() => {});
            }

            parentPort?.postMessage({
                type: "JOB_RESULT",
                ruleId,
                success: !error,
                error,
                rows: returningRows
            });
        }
    } catch (e: any) {
        parentPort?.postMessage({
            type: "JOB_RESULT",
            ruleId: message.ruleId,
            success: false,
            error: e.message
        });
    }
});
