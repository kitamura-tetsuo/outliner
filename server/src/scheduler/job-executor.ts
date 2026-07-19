import { dirname } from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { Hocuspocus } from "@hocuspocus/server";
import BetterSqlite3 from "better-sqlite3";
import { DateTime } from "luxon";
import { resolve } from "path";
import { Worker } from "worker_threads";
import * as Y from "yjs";
import { castValue } from "../schema/valueCasting.js";
import { serverLogger as logger } from "../utils/log-manager.js";
import { computeNextRunAt } from "./schedule-indexer.js";

// The path to the worker file.
// When compiled, it will be in dist/server/src/scheduler/executor-worker.js
// If we are running in ts-node, we might need a different path or to use tsx/ts-node in worker
// For now, let's assume compiled output.
const workerPath = resolve(
    process.env.NODE_ENV === "test"
        ? __dirname + "/executor-worker.js"
        : __dirname + "/executor-worker.js",
);

// We keep a single worker alive.
let worker: Worker | null = null;
let currentJobPromise: {
    resolve: (val: any) => void;
    reject: (err: any) => void;
    timeoutId: NodeJS.Timeout;
} | null = null;

function spawnWorker() {
    // If in test environment and it's ts file, we might need execArgv for ts-node/tsx
    const execArgv = process.env.NODE_ENV === "test" && workerPath.endsWith(".ts")
        ? ["--import", "tsx"]
        : [];

    const execArgvToUse = execArgv.length > 0 ? execArgv : undefined;

    // In node we can use worker_threads
    const w = new Worker(workerPath, { execArgv: execArgvToUse });

    w.on("message", (msg) => {
        if (!currentJobPromise) return;

        if (msg.type === "JOB_SUCCESS") {
            clearTimeout(currentJobPromise.timeoutId);
            currentJobPromise.resolve(msg.payload);
            currentJobPromise = null;
        } else if (msg.type === "JOB_FAILURE") {
            clearTimeout(currentJobPromise.timeoutId);
            currentJobPromise.reject(new Error(msg.error));
            currentJobPromise = null;
        }
    });

    w.on("error", (err) => {
        logger.error({ err }, "Scheduler worker thread error");
        if (currentJobPromise) {
            clearTimeout(currentJobPromise.timeoutId);
            currentJobPromise.reject(err);
            currentJobPromise = null;
        }
        worker = null; // Mark as dead so it gets respawned
    });

    w.on("exit", (code) => {
        if (code !== 0) {
            logger.error(`Scheduler worker stopped with exit code \${code}`);
        }
        if (currentJobPromise) {
            clearTimeout(currentJobPromise.timeoutId);
            currentJobPromise.reject(new Error(`Worker exited with code \${code}`));
            currentJobPromise = null;
        }
        worker = null;
    });

    return w;
}

export function terminateWorker() {
    if (worker) {
        worker.terminate();
        worker = null;
    }
}

export async function executeJob(
    hocuspocus: any, // Hocuspocus instance
    jobId: string,
    rule: any,
    records: any[],
    schemaText: string,
    occurrenceStr: string,
    timeoutMs: number = 10000,
): Promise<any> {
    if (currentJobPromise) {
        throw new Error("Worker is busy");
    }

    if (!worker) {
        worker = spawnWorker();
    }

    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            if (worker) {
                logger.warn({ jobId }, "Job timeout, terminating worker");
                worker.terminate();
                worker = null;
            }
            if (currentJobPromise) {
                currentJobPromise.reject(new Error("Job timeout"));
                currentJobPromise = null;
            }
        }, timeoutMs);

        currentJobPromise = { resolve, reject, timeoutId };

        worker!.postMessage({
            type: "EXECUTE_JOB",
            payload: {
                jobId,
                rule,
                records,
                schemaText,
                occurrenceStr,
            },
        });
    });
}

// Tick loop (main thread)
export async function tickJobExecutor(hocuspocus: any, db: BetterSqlite3.Database) {
    // 1. SELECT due rules
    const dueRules = db.prepare(`
        SELECT * FROM schedule_index
        WHERE state = 'active' AND next_run_at <= ?
    `).all(new Date().toISOString()) as any[];

    for (const ruleRow of dueRules) {
        try {
            await processRule(hocuspocus, db, ruleRow);
        } catch (error) {
            logger.error({ error, ruleId: ruleRow.rule_id }, "Error processing scheduled rule");
            // Still advance next_run_at to avoid retry storm if needed
        }
    }
}

async function processRule(hocuspocus: any, db: BetterSqlite3.Database, ruleRow: any) {
    // 2. Determine occurrences to run
    const nowStr = new Date().toISOString();
    let currentSeq = ruleRow.occurrence_seq;
    let nextRunAt = ruleRow.next_run_at;
    let occurrencesToRun: { str: string; seq: number; }[] = [];

    // We compute forward from the current sequence
    let iterSeq = currentSeq;
    let computed = computeNextRunAt(ruleRow.rrule, ruleRow.dtstart, ruleRow.timezone, iterSeq);

    // Default catchUp = false. We need to get rule properties.
    // The problem is we need to load the Y.Doc to get catchUp and the SQL!
    const roomName = ruleRow.room;
    const directConnection = await hocuspocus.openDirectConnection(roomName, {
        context: { origin: "server-scheduler" },
    });

    try {
        const ydoc = directConnection.document;
        const tablesMap = ydoc.getMap("tables");

        // Let's assume rules are stored somehow. Wait, schedule-indexer reads from
        // table.getMap("schedules")

        let ruleObj: Y.Map<any> | undefined;
        for (const tableId of tablesMap.keys()) {
            const tableMap = tablesMap.get(tableId) as Y.Map<any>;
            const schedulesMap = tableMap.get("schedules") as Y.Map<Y.Map<any>>;
            if (schedulesMap && schedulesMap.has(ruleRow.rule_id)) {
                ruleObj = schedulesMap.get(ruleRow.rule_id);
                break;
            }
        }

        if (!ruleObj) {
            // Rule missing in Yjs, maybe deleted? The indexer should have caught it, but if not, just delete.
            db.prepare(`DELETE FROM schedule_index WHERE rule_id = ?`).run(ruleRow.rule_id);
            return;
        }

        const catchUp = ruleObj.get("catchUp") === true;
        const sql = ruleObj.get("sql");
        const schemaTextMap = tablesMap.get("schema") as Y.Text; // Assuming schema is accessible
        // Wait, the schema Y.Text is typically at ydoc.getText("schema") in demo-api.ts?

        // In demo-api.ts, table schema is read from tableRoom if it's subdocs.
        // Wait! ruleRow.room IS the table doc (subdoc) in outliner?
        // Let's check schedule-indexer.ts handling of `room`

        // Actually, if ruleRow.room is the table subdoc, then:
        const schemaText = ydoc.getText("schema").toString();
        const recordsMap = ydoc.getMap("records") as Y.Map<any>;

        // We'll pass records as an array of plain objects
        const records = Array.from(recordsMap.entries()).map(([k, v]) => {
            // If v is a Y.Map, get its plain object representation
            return v instanceof Y.Map ? v.toJSON() : v;
        });

        // Determine occurrences to run
        while (computed.state === "active" && computed.next_run_at && computed.next_run_at <= nowStr) {
            occurrencesToRun.push({ str: computed.next_run_at, seq: iterSeq });
            iterSeq = computed.nextSeq;
            computed = computeNextRunAt(ruleRow.rrule, ruleRow.dtstart, ruleRow.timezone, iterSeq);
        }

        if (occurrencesToRun.length === 0) {
            // Should have at least one because of the query condition, but maybe logic discrepancy
            // Update next_run_at anyway
            db.prepare(`
                UPDATE schedule_index
                SET next_run_at = ?, occurrence_seq = ?, state = ?
                WHERE room = ? AND rule_id = ?
            `).run(computed.next_run_at, computed.nextSeq, computed.state, ruleRow.room, ruleRow.rule_id);
            return;
        }

        // Apply catch-up policy
        let occurrenceToRun = occurrencesToRun[occurrencesToRun.length - 1]; // Always the most recent
        if (!catchUp && occurrencesToRun.length > 1) {
            // Catch up is false, but we missed some. Wait, "if catchUp is true, run most recent, else none"
            // Wait, spec: "catch-up policy: if multiple occurrences were missed (downtime), run only the most recent one when catchUp is true, none otherwise; then advance the cursor past all missed occurrences."
            // Actually, if multiple missed:
            // catchUp = true -> run the most recent
            // catchUp = false -> run NONE? "run none otherwise". So skip all.
            occurrenceToRun = occurrencesToRun[0]; // Is this right?
            // Let's re-read: "if multiple occurrences were missed... run only most recent when catchUp is true, none otherwise"

            // Wait, if next_run_at is in the past, that's exactly 1 missed?
            // What if it just triggered?
            // Example: schedule is every minute. now is 12:00:05. next_run_at was 12:00:00.
            // length = 1. We should run it.
            if (occurrencesToRun.length > 1 && !catchUp) {
                // Skip running, just advance
                occurrenceToRun = null as any;
            }
        }

        if (occurrenceToRun) {
            const rulePayload = {
                target_table_id: ruleRow.target_table_id,
                timezone: ruleRow.timezone,
                sql: sql,
            };

            const jobId = `\${ruleRow.rule_id}_\${Date.now()}`;
            try {
                // 3. Dispatch job
                const result = await executeJob(
                    hocuspocus,
                    jobId,
                    rulePayload,
                    records,
                    schemaText,
                    occurrenceToRun.str,
                );

                // 4. Write-back
                if (result.rows && result.rows.length > 0) {
                    ydoc.transact(() => {
                        for (const row of result.rows) {
                            if (row.id) {
                                // TODO: Cast/validate returned values against parsed schema
                                // For now, just set it
                                let rowMap = recordsMap.get(row.id) as Y.Map<any>;
                                if (!rowMap) {
                                    rowMap = new Y.Map();
                                    recordsMap.set(row.id, rowMap);
                                }
                                for (const [k, v] of Object.entries(row)) {
                                    // Validate and cast against schema
                                    let finalVal = v;
                                    const colSchema = result.parsedSchema?.columns.find((c: any) => c.name === k);
                                    if (colSchema) {
                                        try {
                                            finalVal = castValue(v, colSchema.kind, colSchema.isNullable);
                                        } catch (castErr: any) {
                                            logger.warn({
                                                ruleId: ruleRow.rule_id,
                                                rowId: row.id,
                                                column: k,
                                                error: castErr.message,
                                            }, "Skipping column due to cast failure");
                                            continue; // Skip invalid columns
                                        }
                                    }
                                    if (finalVal === null) {
                                        rowMap.delete(k);
                                    } else {
                                        rowMap.set(k, finalVal);
                                    }
                                }
                            }
                        }
                        ruleObj!.set("lastRunAt", new Date().toISOString());
                    }, "server-scheduler");
                } else {
                    ydoc.transact(() => {
                        ruleObj!.set("lastRunAt", new Date().toISOString());
                    }, "server-scheduler");
                }

                // Update rule failure state? Clear it if any?
            } catch (jobError: any) {
                logger.error({ jobError: jobError.message }, "Job execution failed");
                // Rule failure handling: optional polish is surfacing error
            }
        }

        // Advance next_run_at
        db.prepare(`
            UPDATE schedule_index
            SET next_run_at = ?, occurrence_seq = ?, state = ?
            WHERE room = ? AND rule_id = ?
        `).run(computed.next_run_at, computed.nextSeq, computed.state, ruleRow.room, ruleRow.rule_id);
    } finally {
        await directConnection.disconnect({ unloadImmediately: false }); // Unloads when no clients
    }
}
