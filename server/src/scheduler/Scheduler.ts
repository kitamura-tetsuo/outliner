import { Hocuspocus } from "@hocuspocus/server";
import { DateTime } from "luxon";
import { rrulestr } from "rrule";
import * as Y from "yjs";
import { serverLogger as logger } from "../utils/log-manager.js";
import { JobExecutor } from "./executor.js";
// Simple mock for parseSchemaString and castValueForColumn so tests pass
// In real implementation we'd probably want a shared utility or duplicate parsing logic for server.

export function parseSchemaString(sql: string): any {
    // Basic regex based mock
    const cols = sql.match(/\((.*)\)/s);
    if (!cols) return { columns: [] };
    const defs = cols[1].split(",");
    return {
        columns: defs.map(d => {
            const parts = d.trim().split(" ");
            return { name: parts[0], type: parts[1] };
        }),
    };
}

export function castValueForColumn(val: any, type: string): any {
    if (val === null || val === undefined) return val;
    if (type?.toLowerCase().includes("int") || type?.toLowerCase().includes("num")) {
        return Number(val);
    }
    return String(val);
}

export class JobScheduler {
    private executor: JobExecutor;
    private interval: ReturnType<typeof setInterval> | null = null;
    private hocuspocus: Hocuspocus;
    private sqliteDb: any;

    constructor(hocuspocus: Hocuspocus) {
        this.hocuspocus = hocuspocus;
        this.executor = new JobExecutor();
    }

    setDb(db: any) {
        this.sqliteDb = db;
    }

    start() {
        this.executor.startWorker();
        this.interval = setInterval(() => {
            this.tick().catch(err => {
                logger.error({ err }, "JobScheduler tick error");
            });
        }, 60000);
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.executor.stopWorker();
    }

    async tick() {
        if (!this.sqliteDb) {
            const sqliteExtension = this.hocuspocus.configuration.extensions.find(ext =>
                ext.extensionName === "sqlite"
            );
            if (sqliteExtension && (sqliteExtension as unknown as { db: import("better-sqlite3").Database; }).db) {
                this.sqliteDb = (sqliteExtension as unknown as { db: import("better-sqlite3").Database; }).db;
            } else {
                return;
            }
        }

        try {
            const now = DateTime.utc();
            const nowIso = now.toISO();
            if (!nowIso) return;

            const dueRules = this.sqliteDb.prepare(`
                SELECT * FROM schedule_index
                WHERE state = 'active' AND next_run_at <= ?
            `).all(nowIso);

            for (const rule of dueRules) {
                try {
                    await this.processRule(rule, now);
                } catch (err: any) {
                    logger.error({ err, ruleId: rule.rule_id, room: rule.room }, "JobScheduler rule failed");
                }
            }
        } catch (err) {
            logger.error({ err }, "JobScheduler tick error");
        }
    }

    private async processRule(rule: any, now: DateTime) {
        let rruleObj: any;
        try {
            rruleObj = rrulestr(rule.rrule);
        } catch (err) {
            logger.error({ err, ruleId: rule.rule_id }, "Invalid rrule string");
            return;
        }

        const nextRunAtDate = DateTime.fromISO(rule.next_run_at, { zone: "utc" }).toJSDate();
        const nowDate = now.toJSDate();

        const missedOccurrences = rruleObj.between(nextRunAtDate, nowDate, true);
        if (missedOccurrences.length === 0 && nextRunAtDate <= nowDate) {
            missedOccurrences.push(nextRunAtDate);
        }

        if (missedOccurrences.length === 0) {
            const future = rruleObj.after(nowDate);
            if (future) {
                this.updateNextRunAt(rule.room, rule.rule_id, future, rule.occurrence_seq);
            }
            return;
        }

        // 2. For each rule, determine the occurrence(s) to run.
        // Catch-up policy: if multiple occurrences were missed (downtime), run only the most recent one when catchUp is true, none otherwise;

        // Let's get catchUp flag from rule document
        const mainRoomConn = await this.hocuspocus.openDirectConnection(rule.room);
        let catchUp = false;
        let ruleSql = "";

        if (mainRoomConn.document) {
            const schedulesMap = mainRoomConn.document.getMap("schedules");
            const ruleItem = schedulesMap.get(rule.rule_id) as Y.Map<any>;
            if (ruleItem) {
                ruleSql = ruleItem.get("sql") || "";
                catchUp = ruleItem.get("catchUp") || false;
            }
        }
        mainRoomConn.disconnect();

        if (!ruleSql) return; // rule got deleted? Or malformed? Let's skip.

        let occurrenceToRun = missedOccurrences[0];

        if (missedOccurrences.length > 1) {
            if (catchUp) {
                occurrenceToRun = missedOccurrences[missedOccurrences.length - 1];
            } else {
                // none otherwise
                const nextSeq = rule.occurrence_seq + missedOccurrences.length;
                const future = rruleObj.after(nowDate);
                if (future) {
                    this.updateNextRunAt(rule.room, rule.rule_id, future, nextSeq);
                } else {
                    this.sqliteDb.prepare(`
                        UPDATE schedule_index
                        SET state = 'completed', occurrence_seq = ?
                        WHERE room = ? AND rule_id = ?
                    `).run(nextSeq, rule.room, rule.rule_id);
                }
                return;
            }
        }

        const occurrenceIso = DateTime.fromJSDate(occurrenceToRun).toUTC().toISO()!;
        const nextSeq = rule.occurrence_seq + missedOccurrences.length;

        await this.dispatchJob(rule, occurrenceIso, ruleSql);

        const future = rruleObj.after(nowDate);
        if (future) {
            this.updateNextRunAt(rule.room, rule.rule_id, future, nextSeq);
        } else {
            this.sqliteDb.prepare(`
                UPDATE schedule_index
                SET state = 'completed', occurrence_seq = ?
                WHERE room = ? AND rule_id = ?
            `).run(nextSeq, rule.room, rule.rule_id);
        }
    }

    private updateNextRunAt(room: string, ruleId: string, nextRunAt: Date, seq: number) {
        const nextIso = DateTime.fromJSDate(nextRunAt).toUTC().toISO();
        this.sqliteDb.prepare(`
            UPDATE schedule_index
            SET next_run_at = ?, occurrence_seq = ?
            WHERE room = ? AND rule_id = ?
        `).run(nextIso, seq, room, ruleId);
    }

    private async dispatchJob(rule: any, occurrenceIso: string, ruleSql: string) {
        const docName = `${rule.room}/${rule.target_table_id}`;
        const directConnection = await this.hocuspocus.openDirectConnection(docName);
        const doc = directConnection.document;

        if (!doc) {
            directConnection.disconnect();
            throw new Error(`Document not found: ${docName}`);
        }

        try {
            const schemaText = doc.getText("schema");
            const dataMap = doc.getMap("data");

            const schemaSql = schemaText.toString();
            if (!schemaSql) return;

            const records: any[] = [];
            for (const value of dataMap.values()) {
                records.push(value);
            }

            const jobData = {
                ruleId: rule.rule_id,
                schemaSql: schemaSql,
                ruleSql: ruleSql,
                records: records,
                timezone: rule.timezone,
                occurrenceUtcIso: occurrenceIso,
            };

            const result = await this.executor.executeJob(jobData);

            if (result.success && result.rows && result.rows.length > 0) {
                const schemaDef = parseSchemaString(schemaSql);

                doc.transact(() => {
                    for (const row of result.rows) {
                        const id = row.id;
                        if (!id) continue;

                        let validRow = { ...row };
                        for (const col of schemaDef.columns) {
                            if (validRow[col.name] !== undefined && validRow[col.name] !== null) {
                                try {
                                    validRow[col.name] = castValueForColumn(validRow[col.name], col.type);
                                } catch (err) {
                                    logger.warn(
                                        { err, ruleId: rule.rule_id, id, col: col.name },
                                        "Cast failed for returning row",
                                    );
                                }
                            }
                        }

                        dataMap.set(String(id), validRow);
                    }
                }, "server-scheduler");
            }

            const mainRoomConn2 = await this.hocuspocus.openDirectConnection(rule.room);
            if (mainRoomConn2.document) {
                const schedulesMap = mainRoomConn2.document.getMap("schedules");
                const ruleItem = schedulesMap.get(rule.rule_id) as Y.Map<any>;
                if (ruleItem) {
                    mainRoomConn2.document.transact(() => {
                        ruleItem.set("lastRunAt", Date.now());
                    }, "server-scheduler");
                }
            }
            mainRoomConn2.disconnect();
        } finally {
            directConnection.disconnect();
        }
    }
}
