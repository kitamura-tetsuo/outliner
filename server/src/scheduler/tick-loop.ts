import { Hocuspocus } from "@hocuspocus/server";
import BetterSqlite3 from "better-sqlite3";
import * as Y from "yjs";
import { serverLogger as logger } from "../utils/log-manager.js";
import { executeJob } from "./job-executor.js";
import { computeNextRunAt } from "./schedule-indexer.js";
import { parseCreateTable } from "../schema/schemaIntrospection.js";
import { castValueForColumn } from "../schema/valueCasting.js";

// Main tick loop that runs every minute
export async function runScheduleTick(db: BetterSqlite3.Database, hocuspocus: Hocuspocus) {
    logger.info("Running schedule tick...");
    const nowStr = new Date().toISOString();

    // 1. SELECT due rules
    const getDueRules = db.prepare(`
        SELECT * FROM schedule_index
        WHERE state = 'active' AND next_run_at <= ?
    `);

    const dueRules = getDueRules.all(nowStr) as any[];
    if (dueRules.length === 0) return;

    const updateRunInfo = db.prepare(`
        UPDATE schedule_index
        SET next_run_at = ?, occurrence_seq = ?, state = ?
        WHERE room = ? AND rule_id = ?
    `);

    for (const rule of dueRules) {
        try {
            await processDueRule(rule, db, hocuspocus, updateRunInfo);
        } catch (err: any) {
            logger.error({ ruleId: rule.rule_id, error: err.message }, "Failed to process due rule");
        }
    }
}

async function processDueRule(rule: any, db: BetterSqlite3.Database, hocuspocus: Hocuspocus, updateRunInfo: BetterSqlite3.Statement) {
    const { room, rule_id, target_table_id, timezone, rrule, dtstart, occurrence_seq } = rule;

    // We only connect to the parent room to check the rule state and get target table id.
    // Wait, the schedule is defined in the parent room. We should load it.
    let projectRoom = room;
    // However, target_table_id is already in the rule record in db!

    if (!target_table_id) {
        throw new Error("No target table ID");
    }

    // Recompute next occurrences
    let cursorSeq = occurrence_seq;
    let nextRun = computeNextRunAt(rrule, dtstart, timezone, cursorSeq);

    // Determine occurrences to run. "catchUp: true" means run most recent, else none.
    // The issue says: "Catch-up policy: if multiple occurrences were missed (downtime), run only the most recent one when catchUp is true, none otherwise; then advance the cursor past all missed occurrences."
    // Let's implement this logic:
    // Actually the `rrule` in schedule_index doesn't store catchUp. We have to read it from the document.

    const directConnection = await hocuspocus.openDirectConnection(projectRoom, {
        isSeeding: false, // Internal usage
    });

    let catchUp = false;
    let ruleSql = "";
    let enabled = false;
    try {
        const doc = directConnection.document;
        const schedulesMap = doc?.getMap("schedules");
        const ruleObj = schedulesMap?.get(rule_id);

        if (ruleObj instanceof Y.Map) {
            catchUp = ruleObj.get("catchUp") as boolean ?? false;
            ruleSql = ruleObj.get("sql") as string ?? "";
            enabled = ruleObj.get("enabled") as boolean ?? true;
        } else {
            // Rule doesn't exist anymore? Skip and delete?
            return;
        }
    } finally {
        await directConnection.disconnect();
    }

    if (!enabled) return;

    if (!ruleSql) return; // Nothing to run

    const now = new Date();
    let occurrencesToRun: string[] = [];

    // Advance cursor past all missed occurrences
    while (nextRun.next_run_at && new Date(nextRun.next_run_at) <= now) {
        occurrencesToRun.push(nextRun.next_run_at);
        cursorSeq++;
        nextRun = computeNextRunAt(rrule, dtstart, timezone, cursorSeq);
    }

    if (occurrencesToRun.length === 0) return; // Should not happen since we selected WHERE next_run_at <= now

    const occurrenceToRun = catchUp ? occurrencesToRun[occurrencesToRun.length - 1] : occurrencesToRun[0]; // If multiple, most recent when catchUp is true, none otherwise. Wait.
    // Issue: "run only the most recent one when catchUp is true, none otherwise" -> actually, if multiple were missed, run NONE if catchUp false.
    // But what if it just ticked on time? Then it's 1 occurrence.
    // If occurrencesToRun.length > 1 and !catchUp, we run none.
    // If length == 1, we run it regardless of catchUp.

    let targetOccurrence: string | null = null;
    if (occurrencesToRun.length === 1) {
        targetOccurrence = occurrencesToRun[0];
    } else if (occurrencesToRun.length > 1 && catchUp) {
        targetOccurrence = occurrencesToRun[occurrencesToRun.length - 1];
    }

    // Now advance db state
    updateRunInfo.run(nextRun.next_run_at, nextRun.nextSeq, nextRun.state, projectRoom, rule_id);

    if (!targetOccurrence) {
        return; // Skip running
    }

    // 3. Dispatch job
    // Extract project ID from projectRoom "projects/ID"
    const projectIdMatch = projectRoom.match(/projects\/([^/]+)/);
    if (!projectIdMatch) return;
    const projectId = projectIdMatch[1];

    const tableRoom = `projects/${projectId}/tables/${target_table_id}`;
    const tableConnection = await hocuspocus.openDirectConnection(tableRoom, { isSeeding: false });

    let schemaSql = "";
    let records: Record<string, any>[] = [];
    let dataMap: Y.Map<unknown> | null = null;

    try {
        const doc = tableConnection.document;
        if (!doc) throw new Error("Table doc not found");

        schemaSql = doc.getText("schema").toString();
        dataMap = doc.getMap("data");

        for (const val of dataMap.values()) {
            if (val instanceof Y.Map) {
                records.push(val.toJSON());
            }
        }
    } catch (e: any) {
        await tableConnection.disconnect();
        logger.error({ ruleId: rule_id, error: e.message }, "Failed to read table doc");
        return;
    }

    let jobSuccess = false;
    let jobError: string | undefined;
    let rows: any[] = [];

    try {
        const result = await executeJob({
            ruleId: rule_id,
            schemaSql,
            records,
            ruleSql,
            timezone,
            occurrenceIso: targetOccurrence
        });

        jobSuccess = result.success;
        jobError = result.error;
        rows = result.rows || [];
    } catch (e: any) {
        jobSuccess = false;
        jobError = e.message;
    }

    // 4. Write back
    if (jobSuccess && dataMap) {
        let parsedSchema;
        try {
            parsedSchema = await parseCreateTable(schemaSql);
        } catch (e) {
            // Ignore if schema is invalid
        }

        tableConnection.transact((document: unknown) => {
            const ydoc = document as unknown as Y.Doc;
            const map = ydoc.getMap("data");

            for (const row of rows) {
                if (row.id) {
                    const rowId = String(row.id);
                    let validRow: any = { ...row };

                    if (parsedSchema) {
                        for (const col of parsedSchema.columns) {
                            if (validRow[col.name] !== undefined) {
                                try {
                                    validRow[col.name] = castValueForColumn(validRow[col.name], col);
                                } catch (e) {
                                    // Skip casting fail
                                }
                            }
                        }
                    }

                    // Convert back to Y.Map and write
                    let existing = map.get(rowId);
                    if (!(existing instanceof Y.Map)) {
                        existing = new Y.Map();
                        map.set(rowId, existing);
                    }

                    // Simple object to Y.Map transfer
                    for (const [k, v] of Object.entries(validRow)) {
                        (existing as Y.Map<unknown>).set(k, v);
                    }
                }
            }
        });
    }

    await tableConnection.disconnect();

    // Update lastRunAt and lastError on the schedule rule map
    const conn2 = await hocuspocus.openDirectConnection(projectRoom, { isSeeding: false });
    try {
        conn2.transact((document: unknown) => {
            const ydoc = document as unknown as Y.Doc;
            const ruleObj = ydoc.getMap("schedules").get(rule_id);
            if (ruleObj instanceof Y.Map) {
                ruleObj.set("lastRunAt", new Date().toISOString());
                if (!jobSuccess) {
                    ruleObj.set("lastError", jobError);
                } else {
                    ruleObj.delete("lastError");
                }
            }
        });
    } finally {
        await conn2.disconnect();
    }
}
