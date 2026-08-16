import { PGlite } from "@electric-sql/pglite";
import { parentPort } from "node:worker_threads";
import { logger } from "../logger.js";
import { JobData } from "./worker-types.js";

/**
 * One PGlite instance for the lifetime of the worker.
 *
 * Every `new PGlite()` instantiates the Postgres WASM module and closing it
 * frees the JIT pages again. Doing that once per job crashed the process:
 * V8's thread-isolation bookkeeping fatals on a repeated
 * instantiate/free cycle in a worker thread
 * ("Check failed: jit_page_->allocations_.erase(addr) == 1" in
 * UnregisterWasmAllocation), which took the whole server test run down with
 * exit code 133. Reusing the instance also removes the ~1.7s startup each job
 * was paying. Jobs stay isolated from each other through their own schema,
 * which is dropped once the job is done.
 */
let dbPromise: Promise<PGlite> | undefined;

function getDb(): Promise<PGlite> {
    if (!dbPromise) {
        dbPromise = (async () => {
            const instance = new PGlite();
            await instance.waitReady;
            return instance;
        })();
        // A failed startup must not be cached, or every later job inherits it.
        dbPromise.catch(() => {
            dbPromise = undefined;
        });
    }
    return dbPromise;
}

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

    const db = await getDb();

    try {
        // The instance is shared across jobs, so a schema left behind by an
        // earlier run of the same rule is cleared before it is recreated.
        await db.exec(`DROP SCHEMA IF EXISTS "${pgSchema}" CASCADE;`);
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
        // CREATE SCHEMA ran outside the transaction, so a ROLLBACK does not
        // undo it: the job's relations are dropped explicitly.
        try {
            await db.exec(`DROP SCHEMA IF EXISTS "${pgSchema}" CASCADE;`);
        } catch (_e) {
            logger.warn({ err: _e }, "Silenced error");
        }
    }
}

// Jobs share one PGlite instance, so they must not interleave: each job runs
// its own transaction and the shared connection has only one session.
let queue: Promise<void> = Promise.resolve();

parentPort?.on("message", (msg) => {
    if (msg.type !== "execute") return;
    queue = queue.then(async () => {
        try {
            const result = await executeJob(msg.data);
            parentPort?.postMessage({ id: msg.id, result });
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            parentPort?.postMessage({ id: msg.id, result: { success: false, error: errorMessage } });
        }
    });
});
