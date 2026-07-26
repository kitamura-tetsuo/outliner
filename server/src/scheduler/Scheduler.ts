import { SQLite } from "@hocuspocus/extension-sqlite";
import { Hocuspocus } from "@hocuspocus/server";
import { DateTime } from "luxon";
import * as Y from "yjs";
import { serverLogger as logger } from "../utils/log-manager.js";
import { JobExecutor } from "./executor.js";
import { computeNextRunAt, ensureScheduleIndex } from "./schedule-indexer.js";

// Upper bound on how many past occurrences a single tick walks through, so a
// rule whose dtstart lies far in the past cannot stall the scheduler.
const MAX_CATCHUP_OCCURRENCES = 500;
// Minimal schema parsing/casting for the rows a rule returns. The client has a
// full implementation (services/yjstable/schemaIntrospection + valueCasting);
// the server only needs enough to store returned values in the column's type.

const TABLE_CONSTRAINT_KEYWORDS = new Set([
    "primary",
    "foreign",
    "unique",
    "check",
    "constraint",
    "exclude",
]);

/**
 * Split a CREATE TABLE body into its top-level definitions. Commas inside
 * parentheses (e.g. `CHECK (status IN ('open', 'done'))`) do not separate
 * column definitions.
 */
function splitColumnDefs(body: string): string[] {
    const defs: string[] = [];
    let depth = 0;
    let inString = false;
    let current = "";
    for (const ch of body) {
        if (ch === "'") inString = !inString;
        if (!inString) {
            if (ch === "(") depth++;
            else if (ch === ")") depth--;
            else if (ch === "," && depth === 0) {
                defs.push(current);
                current = "";
                continue;
            }
        }
        current += ch;
    }
    if (current.trim()) defs.push(current);
    return defs;
}

export function parseSchemaString(sql: string): any {
    const cols = sql.match(/\((.*)\)/s);
    if (!cols) return { columns: [] };
    const columns: { name: string; type: string; }[] = [];
    for (const def of splitColumnDefs(cols[1])) {
        const parts = def.trim().split(/\s+/);
        if (parts.length < 2) continue;
        // Skip table-level constraints; they are not columns.
        if (TABLE_CONSTRAINT_KEYWORDS.has(parts[0].toLowerCase())) continue;
        columns.push({ name: parts[0].replace(/"/g, ""), type: parts[1] });
    }
    return { columns };
}

export function castValueForColumn(val: any, type: string): any {
    if (val === null || val === undefined) return val;
    const lowered = type?.toLowerCase() ?? "";
    if (lowered.includes("bool")) {
        if (typeof val === "boolean") return val;
        if (val === "true" || val === "t" || val === 1) return true;
        if (val === "false" || val === "f" || val === 0) return false;
        return Boolean(val);
    }
    if (lowered.includes("int") || lowered.includes("num")) {
        return Number(val);
    }
    return String(val);
}

export class JobScheduler {
    private executor: JobExecutor;
    private interval: ReturnType<typeof setInterval> | null = null;
    private hocuspocus: Hocuspocus;
    private sqliteDb: any;
    private ticking = false;

    constructor(hocuspocus: Hocuspocus) {
        this.hocuspocus = hocuspocus;
        this.executor = new JobExecutor();
    }

    setDb(db: any) {
        this.sqliteDb = db;
        if (db) ensureScheduleIndex(db);
    }

    /**
     * Start the executor and poll for due rules. By default the first tick
     * runs immediately so rules whose occurrence already passed (e.g. right
     * after a demo reseed) are not delayed by a full interval.
     */
    start(intervalMs = 60000, runImmediately = true) {
        this.executor.startWorker();
        const runTick = () => {
            this.tick().catch(err => {
                logger.error({ err }, "JobScheduler tick error");
            });
        };
        if (runImmediately) runTick();
        this.interval = setInterval(runTick, intervalMs);
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.executor.stopWorker();
    }

    async tick() {
        // Jobs share a single PGlite instance in the worker, so ticks must not
        // overlap: a long-running job would otherwise race the next tick.
        if (this.ticking) return;
        this.ticking = true;
        try {
            await this.runTick();
        } finally {
            this.ticking = false;
        }
    }

    private async runTick() {
        if (!this.sqliteDb) {
            // The persistence extension opens its database asynchronously, so
            // it is resolved on the first tick that finds it. It does not
            // carry an extensionName, hence the fallback on the db property.
            const sqliteExtension = this.hocuspocus.configuration.extensions.find(ext =>
                ext.extensionName === "sqlite" || (ext as unknown as { db?: unknown; }).db
            ) as InstanceType<typeof SQLite> | undefined;
            if (sqliteExtension && sqliteExtension.db) {
                this.setDb(sqliteExtension.db);
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
                } catch (err: unknown) {
                    logger.error({ err, ruleId: rule.rule_id, room: rule.room }, "JobScheduler rule failed");
                }
            }
        } catch (err) {
            logger.error({ err }, "JobScheduler tick error");
        }
    }

    /**
     * Walk the rule's occurrences from the indexed cursor up to `now`.
     * Occurrence instants come from the same computation as the index
     * (`computeNextRunAt`), so the rule's dtstart and timezone are honoured
     * and the times do not drift away from the scheduled wall clock.
     */
    private collectDueOccurrences(rule: any, now: DateTime): {
        missed: string[];
        nextRunAt: string | null;
        nextSeq: number;
        exhausted: boolean;
    } {
        const missed: string[] = [];
        let seq: number = rule.occurrence_seq ?? 0;
        let nextRunAt: string | null = rule.next_run_at;
        let exhausted = false;

        while (nextRunAt && missed.length < MAX_CATCHUP_OCCURRENCES) {
            if (DateTime.fromISO(nextRunAt, { zone: "utc" }) > now) break;
            missed.push(nextRunAt);
            seq += 1;
            const computed = computeNextRunAt(rule.rrule, rule.dtstart, rule.timezone, seq);
            nextRunAt = computed.next_run_at;
            if (computed.state === "exhausted") {
                exhausted = true;
                break;
            }
            if (computed.state === "invalid") {
                logger.error(
                    { ruleId: rule.rule_id, room: rule.room, error: computed.error },
                    "Invalid schedule rule while advancing occurrences",
                );
                break;
            }
        }

        return { missed, nextRunAt, nextSeq: seq, exhausted };
    }

    private async processRule(rule: any, now: DateTime) {
        const { missed, nextRunAt, nextSeq, exhausted } = this.collectDueOccurrences(rule, now);

        if (missed.length === 0) {
            if (nextRunAt) this.updateNextRunAt(rule.room, rule.rule_id, nextRunAt, nextSeq);
            return;
        }

        // Catch-up policy: when several occurrences were missed (downtime),
        // run only the most recent one if catchUp is set, none otherwise.
        // If an occurrence fails, it is currently skipped (the cursor advances)
        // rather than retried on the next tick.
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

        const skipAll = missed.length > 1 && !catchUp;
        if (!skipAll) {
            const occurrenceIso = catchUp ? missed[missed.length - 1] : missed[0];
            await this.dispatchJob(rule, occurrenceIso, ruleSql);
        }

        if (exhausted || !nextRunAt) {
            this.sqliteDb.prepare(`
                UPDATE schedule_index
                SET state = 'completed', occurrence_seq = ?
                WHERE room = ? AND rule_id = ?
            `).run(nextSeq, rule.room, rule.rule_id);
        } else {
            this.updateNextRunAt(rule.room, rule.rule_id, nextRunAt, nextSeq);
        }
    }

    private updateNextRunAt(room: string, ruleId: string, nextRunAtIso: string, seq: number) {
        this.sqliteDb.prepare(`
            UPDATE schedule_index
            SET next_run_at = ?, occurrence_seq = ?
            WHERE room = ? AND rule_id = ?
        `).run(nextRunAtIso, seq, room, ruleId);
    }

    private async dispatchJob(rule: any, occurrenceIso: string, ruleSql: string) {
        // Table contents live in their own room (see client roomPath.ts:
        // `projects/<projectId>/tables/<tableId>`).
        const docName = `${rule.room}/tables/${rule.target_table_id}`;
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

            // Records are nested Y.Maps; the executor runs in a worker thread,
            // so they must be plain (structured-cloneable) objects.
            const records: any[] = [];
            for (const value of dataMap.values()) {
                records.push(value instanceof Y.Map ? value.toJSON() : value);
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

            if (!result.success) {
                logger.warn(
                    { ruleId: rule.rule_id, room: rule.room, error: result.error },
                    "Schedule rule SQL failed",
                );
            }

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

                        // Data Storage keeps one nested Y.Map per record so
                        // that concurrent field edits merge (see tableDocs.ts).
                        const recordId = String(id);
                        let record = dataMap.get(recordId) as Y.Map<any> | undefined;
                        if (!(record instanceof Y.Map)) {
                            record = new Y.Map<any>();
                            dataMap.set(recordId, record);
                        }
                        for (const [column, value] of Object.entries(validRow)) {
                            record.set(column, value === undefined ? null : value);
                        }
                        record.set("id", recordId);
                    }
                }, "server-scheduler");
            }

            const mainRoomConn2 = await this.hocuspocus.openDirectConnection(rule.room);
            if (mainRoomConn2.document) {
                const schedulesMap = mainRoomConn2.document.getMap("schedules");
                const ruleItem = schedulesMap.get(rule.rule_id) as Y.Map<any>;
                if (ruleItem) {
                    mainRoomConn2.document.transact(() => {
                        // ISO string: the UI parses lastRunAt with new Date(...).
                        ruleItem.set("lastRunAt", new Date().toISOString());
                        if (result.success) {
                            ruleItem.set("lastRunStatus", "ok");
                            ruleItem.delete("lastRunError");
                        } else {
                            ruleItem.set("lastRunStatus", "error");
                            ruleItem.set("lastRunError", result.error || "Unknown error");
                        }
                    }, "server-scheduler");
                }
            }
            mainRoomConn2.disconnect();
        } finally {
            directConnection.disconnect();
        }
    }
}
