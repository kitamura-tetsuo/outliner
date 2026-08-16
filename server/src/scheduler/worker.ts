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
 * was paying. Isolation between jobs comes from resetSession, not from the
 * instance boundary.
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

/**
 * Return the shared instance to a pristine state between jobs.
 *
 * A rule's SQL is arbitrary and comes from its own project, so the per-job
 * schema alone is not an isolation boundary: a rule can name another schema
 * explicitly. Since one instance now serves every project, each job is undone
 * on three levels — its transaction is rolled back (which also removes the DDL
 * it ran), the session is discarded, and any schema that still managed to
 * survive is dropped.
 *
 * If the cleanup itself fails the instance cannot be proven clean, so it is
 * dropped and the next job builds a fresh one.
 */
async function resetSession(db: PGlite) {
    try {
        await db.exec("ROLLBACK;");
        // Resets session state a rule could have changed outside the
        // transaction (settings, temp tables, prepared statements).
        await db.exec("DISCARD ALL;");
        await db.exec(`
            DO $$
            DECLARE s text;
            BEGIN
                FOR s IN
                    SELECT nspname FROM pg_namespace
                    WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
                      AND nspname NOT LIKE 'pg\\_temp\\_%'
                      AND nspname NOT LIKE 'pg\\_toast\\_temp\\_%'
                LOOP
                    EXECUTE format('DROP SCHEMA %I CASCADE', s);
                END LOOP;
            END $$;
            CREATE SCHEMA IF NOT EXISTS public;
        `);
    } catch (err) {
        logger.warn({ err }, "PGlite session reset failed; recycling the instance");
        dbPromise = undefined;
        try {
            await db.close();
        } catch (_e) {
            logger.warn({ err: _e }, "Silenced error");
        }
    }
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
        // Everything the job touches happens inside a transaction that is
        // always discarded (see resetSession): the rule's output is handed back
        // to the scheduler, which writes it into Yjs, so nothing has any reason
        // to survive in Postgres. `ruleSql` is authored per project, and the
        // instance is now shared, so a rule must not be able to leave anything
        // behind for another project's job to read.
        await db.exec(`BEGIN;`);
        await db.exec(`CREATE SCHEMA "${pgSchema}";`);
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

        // The rows are read out of the transaction before it is discarded:
        // RETURNING gives them to us without anything being committed.
        const result = await db.query(ruleSql);
        return { success: true, rows: result.rows };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMessage };
    } finally {
        await resetSession(db);
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
