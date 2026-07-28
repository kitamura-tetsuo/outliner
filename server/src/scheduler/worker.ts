import { PGlite } from "@electric-sql/pglite";
import { parentPort } from "node:worker_threads";
import { JobData } from "./worker-types.js";
import { logger } from "../logger.js";


async function executeJob(data: JobData) {
    const { schemaSql, ruleSql, records, timezone, occurrenceUtcIso, ruleId } = data;

    // A rule may read any table of its project, so the job materializes one
    // relation per entry of `tables` (the target table first). `schemaSql` /
    // `records` are the single-table form of the same input.
    const tableDefs: { schemaSql: string; records?: Record<string, unknown>[]; }[] =
        Array.isArray(data.tables) && data.tables.length > 0
            ? data.tables
            : [{ schemaSql, records }];

    if (typeof ruleId !== "string" || !/^[A-Za-z0-9_-]+$/.test(ruleId)) {
        return { success: false, error: "Invalid ruleId" };
    }
    const pgSchema = `t_${ruleId.replace(/-/g, "_")}`;

    if (timezone) {
        try {
            Intl.DateTimeFormat(undefined, { timeZone: timezone });
        } catch (_e) {
            logger.warn({ err: _e }, "Silenced error");
            return { success: false, error: "Invalid timezone" };
        }
    }

    const db = new PGlite();
    await db.waitReady;

    try {
        await db.exec(`CREATE SCHEMA "${pgSchema}";`);

        await db.exec(`BEGIN;`);
        await db.exec(`SET LOCAL search_path TO "${pgSchema}";`);

        // Each table's records go into the relation its own CREATE TABLE just
        // created, so the tables created so far are tracked as they appear.
        const created = new Set<string>();
        for (const table of tableDefs) {
            if (!table?.schemaSql) continue;
            await db.exec(table.schemaSql);

            const tablesRes = await db.query<{ table_name: string; }>(
                `
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = $1
            `,
                [pgSchema],
            );
            const tableName = tablesRes.rows
                .map((r) => r.table_name)
                .find((name: string) => !created.has(name));
            if (!tableName) continue;
            created.add(tableName);

            const tableRecords = table.records;
            if (!tableRecords || tableRecords.length === 0) continue;

            const colsRes = await db.query<{ column_name: string; }>(
                `
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = $1 AND table_name = $2
            `,
                [pgSchema, tableName],
            );
            const cols = colsRes.rows.map(r => r.column_name);

            let query = `INSERT INTO "${tableName}" (${cols.map(c => `"${c.replace(/"/g, '""')}"`).join(",")}) VALUES `;
            const flatValues: unknown[] = [];
            const values = tableRecords.map((record: Record<string, unknown>, rIdx: number) => {
                const rowPlaceholders = cols.map((c, cIdx) => {
                    const val = record[c] !== undefined ? record[c] : null;
                    flatValues.push(val);
                    return "$" + (rIdx * cols.length + cIdx + 1);
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
        } catch (_e) {
            logger.warn({ err: _e }, "Silenced error");
        }
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
