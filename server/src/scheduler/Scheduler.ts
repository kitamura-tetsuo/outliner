import { SQLite } from "@hocuspocus/extension-sqlite";
import { Hocuspocus } from "@hocuspocus/server";
import type BetterSqlite3 from "better-sqlite3";
import { DateTime } from "luxon";
import * as Y from "yjs";
import { validateExplicitSelectAliases } from "../../../shared/src/services/explicitSelectAlias.js";
import { parseSqlIdentifiers } from "../../../shared/src/services/readOnlySql.js";
import { serverLogger as logger } from "../utils/log-manager.js";
import { JobExecutor } from "./executor.js";
import { validateScheduleRowIdentities } from "./row-validation.js";
import { computeNextRunAt, ensureScheduleIndex, ScheduleIndexRow } from "./schedule-indexer.js";
import {
    applyRunOutcome,
    publishSchedulerCursor,
    type RunOutcome,
    SCHEDULER_ORIGIN,
    type SchedulerCursor,
} from "./schedule-status-publisher.js";

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

export interface SchemaDefinition {
    columns: { name: string; type: string; }[];
}

export function parseSchemaString(sql: string): SchemaDefinition {
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

export function castValueForColumn(val: unknown, type: string): unknown {
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
    private sqliteDb: BetterSqlite3.Database | undefined;
    private ticking = false;
    private runQueue: Promise<void> = Promise.resolve();
    /**
     * Whether every indexed room has been swept for interrupted runs. The sweep
     * has to happen once the persistence database is resolvable (which is only
     * true from the first tick onwards) and, within a tick, strictly before
     * anything is dispatched, so that it can never mistake a live execution for
     * a stale one.
     */
    private reconciledInterruptedRuns = false;
    /**
     * Rooms still owing a sweep: `undefined` until the index has been
     * enumerated, then the rooms whose sweep has not yet succeeded. Recovery
     * that fails transiently stays pending and is retried on later ticks
     * instead of being dropped for the lifetime of the process.
     */
    private roomsAwaitingRunReconciliation: string[] | undefined = undefined;
    /** Whether the stored documents can be read back (see `canObservePersistence`). */
    private persistenceIsObservable = false;
    private warnedAboutUnobservablePersistence = false;

    constructor(hocuspocus: Hocuspocus) {
        this.hocuspocus = hocuspocus;
        this.executor = new JobExecutor();
    }

    setDb(db: BetterSqlite3.Database) {
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

    /**
     * Await the returned promise before starting another scheduler in the same
     * process: the executor's worker holds Postgres as a WASM module, and
     * spawning the next worker before this one has finished terminating aborts
     * the process (see JobExecutor.workerReady).
     */
    stop(): Promise<void> {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        return this.executor.stopWorker();
    }

    async tick() {
        // Jobs share a single PGlite instance in the worker, so ticks must not
        // overlap: a long-running job would otherwise race the next tick.
        if (this.ticking) return;

        // Use a promise queue so a manual run and a scheduled tick never overlap
        this.ticking = true;
        this.runQueue = this.runQueue.then(async () => {
            try {
                await this.runTick();
            } finally {
                this.ticking = false;
            }
        });
        await this.runQueue;
    }

    async runRuleNow(room: string, ruleId: string): Promise<{ success: boolean; error?: string; }> {
        // A manual run waits in the queue instead of being dropped
        const task = async () => {
            const conn = await this.hocuspocus.openDirectConnection(room);
            let ruleSql = "";
            let targetTableId = "";
            let timezone = "UTC";
            let strictAliases = false;
            try {
                if (!conn.document) {
                    return { success: false, error: "Document not found" };
                }
                const schedulesMap = conn.document.getMap("schedules");
                const ruleItem = schedulesMap.get(ruleId) as Y.Map<unknown> | undefined;
                if (!ruleItem) {
                    return { success: false, error: "Rule not found" };
                }
                ruleSql = (ruleItem.get("sql") as string) || "";
                targetTableId = (ruleItem.get("targetTableId") as string) || "";
                timezone = (ruleItem.get("timezone") as string) || "UTC";
                strictAliases = ruleItem.get("sqlAliasPolicyVersion") === 1;
            } finally {
                conn.disconnect();
            }

            if (!ruleSql || !targetTableId) {
                return { success: false, error: "Missing required rule data (sql or targetTableId)" };
            }
            if (strictAliases) {
                try {
                    validateExplicitSelectAliases(ruleSql);
                } catch (error) {
                    return { success: false, error: error instanceof Error ? error.message : String(error) };
                }
            }

            // The recurrence fields come from the index when the rule is
            // scheduled, and are left empty when it is not (a manual run reads
            // none of them). The target table and timezone always come from the
            // rule document: the index lags an edit until the document is
            // stored, and trying the SQL out right after editing it is what the
            // button is for.
            const indexed = this.sqliteDb
                ? this.sqliteDb.prepare(`
                    SELECT * FROM schedule_index
                    WHERE room = ? AND rule_id = ?
                `).get(room, ruleId) as ScheduleIndexRow | undefined
                : undefined;

            const row: ScheduleIndexRow = {
                room,
                rule_id: ruleId,
                target_table_id: targetTableId,
                timezone,
                rrule: indexed?.rrule ?? "",
                dtstart: indexed?.dtstart ?? "",
                next_run_at: indexed?.next_run_at ?? null,
                occurrence_seq: indexed?.occurrence_seq ?? 0,
                state: indexed?.state ?? "disabled",
            };

            let dispatchResult: { success: boolean; error?: string; } = { success: true };
            try {
                dispatchResult = await this.dispatchJob(row, DateTime.utc().toISO()!, ruleSql);
            } catch (err: unknown) {
                dispatchResult.success = false;
                dispatchResult.error = err instanceof Error ? err.message : String(err);
            }

            return dispatchResult;
        };

        let result: { success: boolean; error?: string; } = { success: false };
        this.runQueue = this.runQueue.then(async () => {
            try {
                this.ticking = true;
                result = await task();
            } catch (err: unknown) {
                result = { success: false, error: err instanceof Error ? err.message : String(err) };
            } finally {
                this.ticking = false;
            }
        });
        await this.runQueue;

        return result;
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

        // Self-guarding: it retries on later ticks until every indexed room has
        // actually been swept, and becomes a no-op afterwards.
        await this.reconcileInterruptedRuns();

        try {
            const now = DateTime.utc();
            const nowIso = now.toISO();
            if (!nowIso) return;

            if (!this.sqliteDb) return;
            const dueRules = this.sqliteDb.prepare(`
                SELECT * FROM schedule_index
                WHERE state = 'active' AND next_run_at <= ?
            `).all(nowIso) as ScheduleIndexRow[];

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
     * Terminate executions this process can no longer complete.
     *
     * `lastRunStatus: "running"` is written before a job is dispatched and
     * overwritten by the terminal result afterwards. If the process dies in
     * between, that `running` marker outlives the execution it describes and
     * would otherwise be presented as "currently running" forever.
     *
     * What a surviving marker means depends on how far its execution got. One
     * that recorded no outcome never produced a result, so it becomes
     * `interrupted` — a non-success terminal result that deliberately leaves
     * `lastSuccessfulRunAt` untouched. One that recorded an outcome finished
     * its work and only failed to publish it, so that outcome is republished
     * as it stands: a success stays a success, keeps the completion time the
     * execution actually reached, and its SQL is not run again.
     *
     * Recovery is retried until it succeeds. A room whose sweep fails
     * transiently (the document cannot be opened, the write is rejected) stays
     * pending and is attempted again on the next tick: dropping it would leave
     * that Schedule presented as running for the lifetime of the process, which
     * is the very state this sweep exists to end.
     *
     * Within a tick the sweep runs before anything is dispatched, and ticks and
     * manual runs are serialised through `runQueue`, so a `running` marker it
     * finds can never belong to an execution that is still live.
     */
    private async reconcileInterruptedRuns(): Promise<void> {
        if (this.reconciledInterruptedRuns || !this.sqliteDb) return;

        if (!this.roomsAwaitingRunReconciliation) {
            try {
                // Runs that claimed a generation without writing a terminal
                // result are the direct evidence of an interrupted execution,
                // and the only evidence for a `Run now` of a rule the
                // recurrence index does not carry (no recurrence, or one the
                // indexer rejected). The recurrence index is swept as well, so
                // a marker written before this bookkeeping existed is still
                // recovered. A failure here leaves the list unset so the next
                // tick enumerates again rather than skipping recovery.
                const rows = this.sqliteDb.prepare(`
                    SELECT room FROM schedule_active_runs
                    UNION
                    SELECT room FROM schedule_index
                `).all() as { room: string; }[];
                this.roomsAwaitingRunReconciliation = rows.map(row => row.room);
            } catch (err) {
                logger.error({ err }, "JobScheduler could not list rooms to reconcile interrupted runs");
                return;
            }
        }

        const stillPending: string[] = [];
        for (const room of this.roomsAwaitingRunReconciliation) {
            try {
                await this.reconcileInterruptedRunsInRoom(room);
            } catch (err) {
                logger.error({ err, room }, "JobScheduler failed to reconcile interrupted runs for a room; retrying");
                stillPending.push(room);
            }
        }

        this.roomsAwaitingRunReconciliation = stillPending;
        if (stillPending.length === 0) this.reconciledInterruptedRuns = true;
    }

    /** Remember that an execution is in flight, so a restart can find it again. */
    private recordActiveRun(room: string, ruleId: string, runSeq: number): void {
        if (!this.sqliteDb) return;
        this.sqliteDb.prepare(`
            INSERT INTO schedule_active_runs (room, rule_id, run_seq, status, error, completed_at, cursor_state, cursor_next_run_at)
            VALUES (?, ?, ?, NULL, NULL, NULL, NULL, NULL)
            ON CONFLICT(room, rule_id) DO UPDATE SET
                run_seq = excluded.run_seq,
                status = NULL, error = NULL, completed_at = NULL,
                cursor_state = NULL, cursor_next_run_at = NULL
        `).run(room, ruleId, runSeq);
    }

    /**
     * Record what an execution actually produced, before anything tries to
     * publish it. Scoped to its own generation so a slow finisher cannot
     * describe the newer execution that superseded it.
     */
    private recordRunOutcome(room: string, ruleId: string, runSeq: number, outcome: RunOutcome): void {
        if (!this.sqliteDb) return;
        this.sqliteDb.prepare(`
            UPDATE schedule_active_runs
            SET status = ?, error = ?, completed_at = ?, cursor_state = ?, cursor_next_run_at = ?
            WHERE room = ? AND rule_id = ? AND run_seq = ?
        `).run(
            outcome.status,
            outcome.error ?? null,
            outcome.completedAt,
            outcome.cursor?.state ?? null,
            outcome.cursor?.nextRunAt ?? null,
            room,
            ruleId,
            runSeq,
        );
    }

    /**
     * Forget an execution whose terminal result is durably published. Scoped to
     * its own generation so a slow finisher cannot erase the marker of the
     * newer execution that superseded it.
     */
    private clearActiveRun(room: string, ruleId: string, runSeq: number): void {
        if (!this.sqliteDb) return;
        this.sqliteDb.prepare(`
            DELETE FROM schedule_active_runs WHERE room = ? AND rule_id = ? AND run_seq = ?
        `).run(room, ruleId, runSeq);
    }

    /** The executions this room still owes a published terminal result, by rule. */
    private owedRuns(room: string): Map<string, { runSeq: number; outcome?: RunOutcome; }> {
        const owed = new Map<string, { runSeq: number; outcome?: RunOutcome; }>();
        if (!this.sqliteDb) return owed;
        const rows = this.sqliteDb.prepare(`
            SELECT rule_id, run_seq, status, error, completed_at, cursor_state, cursor_next_run_at
            FROM schedule_active_runs WHERE room = ?
        `).all(room) as {
            rule_id: string;
            run_seq: number;
            status: string | null;
            error: string | null;
            completed_at: string | null;
            cursor_state: string | null;
            cursor_next_run_at: string | null;
        }[];
        for (const row of rows) {
            owed.set(row.rule_id, {
                runSeq: row.run_seq,
                outcome: row.status && row.completed_at
                    ? {
                        status: row.status === "ok" ? "ok" : "error",
                        error: row.error ?? undefined,
                        completedAt: row.completed_at,
                        cursor: row.cursor_state
                            ? {
                                state: row.cursor_state as SchedulerCursor["state"],
                                nextRunAt: row.cursor_next_run_at,
                            }
                            : undefined,
                    }
                    : undefined,
            });
        }
        return owed;
    }

    /** Sweep one room. Throws when the room could not be reconciled, so the caller can retry it. */
    private async reconcileInterruptedRunsInRoom(room: string): Promise<void> {
        const connection = await this.hocuspocus.openDirectConnection(room);
        try {
            const document = connection.document;
            // A room that resolves to no document holds no marker to reconcile;
            // that is a completed sweep, not a failure to retry forever.
            if (!document) return;
            const owed = this.owedRuns(room);
            const schedulesMap = document.getMap("schedules");
            const interrupted: string[] = [];
            const republished: string[] = [];
            const markInterrupted = (ruleItem: Y.Map<unknown>, ruleId: string) => {
                ruleItem.set("lastRunStatus", "interrupted");
                ruleItem.set(
                    "lastRunError",
                    "Execution did not complete: the scheduler restarted while it was running.",
                );
                interrupted.push(ruleId);
            };
            document.transact(() => {
                // The ledger is the record of what is actually owed, so it is
                // read first: a `running` marker in the document is evidence,
                // but not the only evidence, and not always present.
                for (const [ruleId, pending] of owed) {
                    const ruleItem = schedulesMap.get(ruleId);
                    if (!(ruleItem instanceof Y.Map)) continue;
                    const currentSeq = (ruleItem.get("lastRunSeq") as number | undefined) ?? 0;
                    // A newer execution has already claimed this Schedule, so
                    // this result would pair an old outcome with a newer start.
                    if (pending.runSeq < currentSeq) continue;
                    // The document has not caught up with this generation at
                    // all — its claim did not survive. Recording it keeps the
                    // ordering consistent for whatever writes next.
                    if (pending.runSeq > currentSeq) ruleItem.set("lastRunSeq", pending.runSeq);

                    // An execution that produced a result before it lost the
                    // ability to publish it is not interrupted — it finished.
                    // Its own outcome and completion time are republished, so a
                    // success stays a success and no SQL runs a second time.
                    // Its *cursor* is not replayed from memory: the recurrence
                    // may have been withdrawn while the outcome waited, so the
                    // published cursor is taken from the index as it stands.
                    if (pending.outcome) {
                        applyRunOutcome(ruleItem, this.outcomeForReplay(room, ruleId, pending.outcome));
                        republished.push(ruleId);
                    } else {
                        markInterrupted(ruleItem, ruleId);
                    }
                }

                // Markers written before the ledger carried outcomes, and any
                // `running` state whose execution left no record at all.
                schedulesMap.forEach((ruleItem, ruleId) => {
                    if (!(ruleItem instanceof Y.Map)) return;
                    if (owed.has(ruleId)) return;
                    if (ruleItem.get("lastRunStatus") !== "running") return;
                    markInterrupted(ruleItem, ruleId);
                });
            }, SCHEDULER_ORIGIN);
            if (interrupted.length > 0) {
                logger.warn({ room, ruleIds: interrupted }, "Reconciled interrupted schedule executions");
            }
            if (republished.length > 0) {
                logger.warn({ room, ruleIds: republished }, "Republished schedule results that could not be recorded");
            }
            // Persisted before the markers are dropped, for the same reason
            // `markRunFinished` waits: the markers are the only record that
            // these rooms are still owed a terminal state, so they must not be
            // discarded while the write that settles them is only in memory —
            // nor on a store request that resolved without storing anything.
            await this.requestRoomStore(document);
            // Each marker is spent only once storage is observed to carry its
            // execution's terminal state. Any that is not stays for the next
            // sweep, which is why this throws rather than leaving them behind.
            let unsettled = 0;
            for (const [ruleId, pending] of owed) {
                if (this.runIsDurablySettled(room, ruleId, pending.runSeq)) {
                    this.clearActiveRun(room, ruleId, pending.runSeq);
                } else {
                    unsettled += 1;
                }
            }
            if (unsettled > 0) {
                throw new Error(`${unsettled} interrupted execution(s) in ${room} could not be settled durably`);
            }
        } finally {
            connection.disconnect();
        }
    }

    /**
     * Walk the rule's occurrences from the indexed cursor up to `now`.
     * Occurrence instants come from the same computation as the index
     * (`computeNextRunAt`), so the rule's dtstart and timezone are honoured
     * and the times do not drift away from the scheduled wall clock.
     */
    private collectDueOccurrences(rule: ScheduleIndexRow, now: DateTime): {
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

    private async processRule(rule: ScheduleIndexRow, now: DateTime) {
        const { missed, nextRunAt, nextSeq, exhausted } = this.collectDueOccurrences(rule, now);

        if (missed.length === 0) {
            if (nextRunAt) await this.updateNextRunAt(rule.room, rule.rule_id, nextRunAt, nextSeq);
            return;
        }

        // Catch-up policy: when several occurrences were missed (downtime),
        // run only the most recent one if catchUp is set, none otherwise.
        // If an occurrence fails, it is currently skipped (the cursor advances)
        // rather than retried on the next tick.
        const mainRoomConn = await this.hocuspocus.openDirectConnection(rule.room);
        let catchUp = false;
        let ruleSql = "";
        let strictAliases = false;

        try {
            if (mainRoomConn.document) {
                const schedulesMap = mainRoomConn.document.getMap("schedules");
                const ruleItem = schedulesMap.get(rule.rule_id) as Y.Map<unknown> | undefined;
                if (ruleItem) {
                    ruleSql = (ruleItem.get("sql") as string) || "";
                    catchUp = (ruleItem.get("catchUp") as boolean) || false;
                    strictAliases = ruleItem.get("sqlAliasPolicyVersion") === 1;
                }
            }
        } finally {
            mainRoomConn.disconnect();
        }

        if (!ruleSql) {
            // rule got deleted? Or malformed? Let's skip.
            if (this.sqliteDb) {
                this.sqliteDb.prepare(`
                    UPDATE schedule_index
                    SET state = 'orphaned'
                    WHERE room = ? AND rule_id = ?
                `).run(rule.room, rule.rule_id);
            }
            logger.warn({ ruleId: rule.rule_id, room: rule.room }, "Skipping and orphaning rule: ruleSql is empty");
            await this.publishCursor(rule.room, rule.rule_id, { state: "orphaned", nextRunAt: null });
            return;
        }
        if (strictAliases) {
            try {
                validateExplicitSelectAliases(ruleSql);
            } catch (error) {
                logger.warn({ ruleId: rule.rule_id, error }, "Strict Schedule SQL violates explicit-alias policy");
                return;
            }
        }

        // The cursor this rule holds once every occurrence dispatched below has
        // been consumed. Each dispatch is handed the cursor its own occurrence
        // leaves behind, so the execution's terminal result and the recurrence
        // state it produced reach the document in one transaction — the manager
        // can never observe a terminal Result still paired with the occurrence
        // that execution just consumed (issue #5290 REQ-006/REQ-008).
        const finalCursor: SchedulerCursor = exhausted || !nextRunAt
            ? { state: "completed", nextRunAt: null }
            : { state: "active", nextRunAt };
        const baseSeq = rule.occurrence_seq ?? 0;

        const skipAll = missed.length > 1 && !catchUp;
        if (!skipAll) {
            // Without catch-up only the most recent missed occurrence runs, but
            // it still consumes every earlier one, so its follow-on cursor is
            // the final one either way.
            const occurrences = catchUp ? missed : [missed[0]];
            for (const [index, occurrenceIso] of occurrences.entries()) {
                const isLast = index === occurrences.length - 1;
                await this.dispatchJob(rule, occurrenceIso, ruleSql, {
                    cursor: isLast ? finalCursor : { state: "active", nextRunAt: occurrences[index + 1] },
                    seq: isLast ? nextSeq : baseSeq + index + 1,
                });
            }
            // Every dispatched occurrence committed its own follow-on cursor.
            return;
        }

        logger.warn(
            {
                ruleId: rule.rule_id,
                room: rule.room,
                count: missed.length,
                skippedRange: `${missed[0]} to ${missed[missed.length - 1]}`,
            },
            "JobScheduler skipped occurrences",
        );
        const mainRoomConn2 = await this.hocuspocus.openDirectConnection(rule.room);
        if (mainRoomConn2.document) {
            const schedulesMap = mainRoomConn2.document.getMap("schedules");
            const ruleItem = schedulesMap.get(rule.rule_id) as Y.Map<unknown> | undefined;
            if (ruleItem) {
                mainRoomConn2.document.transact(() => {
                    const currentSkipped = (ruleItem.get("skippedOccurrences") as number) || 0;
                    ruleItem.set("skippedOccurrences", currentSkipped + missed.length);
                }, "server-scheduler");
            }
        }
        mainRoomConn2.disconnect();

        // Nothing ran, so no execution owns this cursor move.
        if (this.commitIndexCursor(rule.room, rule.rule_id, finalCursor, nextSeq)) {
            await this.publishCursor(rule.room, rule.rule_id, finalCursor);
        }
    }

    /**
     * Move the scheduler's own recurrence cursor in the index.
     *
     * Returns whether the cursor was actually committed. The index row can
     * disappear underneath a tick — a Schedule whose recurrence is cleared
     * while it is executing is dropped from the index by the store hook, which
     * withdraws its published cursor at the same time. The update then matches
     * nothing, and the cursor this tick was carrying describes a recurrence
     * that no longer exists. Reporting that lets the caller withhold it rather
     * than republish an occurrence nothing will honour: the scheduler
     * publishes a cursor only while it still owns the index row behind it.
     */
    private commitIndexCursor(room: string, ruleId: string, cursor: SchedulerCursor, seq: number): boolean {
        if (!this.sqliteDb) return false;
        const info = this.sqliteDb.prepare(`
            UPDATE schedule_index
            SET next_run_at = ?, occurrence_seq = ?, state = ?
            WHERE room = ? AND rule_id = ?
        `).run(cursor.nextRunAt, seq, cursor.state, room, ruleId);
        return info.changes > 0;
    }

    /**
     * Correct the cursor of a rule that turned out not to be due after all. No
     * execution is involved, so there is no terminal result to write it with.
     */
    private async updateNextRunAt(room: string, ruleId: string, nextRunAtIso: string, seq: number) {
        const cursor: SchedulerCursor = { state: "active", nextRunAt: nextRunAtIso };
        if (this.commitIndexCursor(room, ruleId, cursor, seq)) {
            await this.publishCursor(room, ruleId, cursor);
        }
    }

    /**
     * Mirror the cursor the tick just moved into the shared document, so the
     * Schedules Manager sees the scheduler's own `Next run` without polling
     * and without recomputing the recurrence for itself.
     */
    private async publishCursor(room: string, ruleId: string, cursor: SchedulerCursor): Promise<void> {
        try {
            await publishSchedulerCursor(this.hocuspocus, room, ruleId, cursor);
        } catch (err) {
            // Publishing is telemetry: the index remains authoritative and the
            // manager falls back to an explicit "unavailable" state, so a
            // failure here must never abort the tick.
            logger.warn({ err, room, ruleId }, "Failed to publish scheduler cursor");
        }
    }

    /**
     * Read a table subdoc: its schema and its records as plain objects (the
     * executor runs in a worker thread, so records must be structured-
     * cloneable rather than nested Y.Maps).
     */
    private readTableDoc(doc: Y.Doc): { schemaSql: string; records: Record<string, unknown>[]; } {
        const schemaSql = doc.getText("schema").toString();
        const records: Record<string, unknown>[] = [];
        for (const value of doc.getMap("data").values()) {
            records.push(
                value instanceof Y.Map ? value.toJSON() as Record<string, unknown> : value as Record<string, unknown>,
            );
        }
        return { schemaSql, records };
    }

    /**
     * The other tables of the project the rule SQL reads from. A rule writes
     * into its target table only, but may query any table of the project (as
     * the demo's recurring tasks do: the rule reads the templates table and
     * inserts into the occurrences one), so every registered table whose SQL
     * name appears in the statement is materialized alongside the target.
     */
    private async loadReferencedTables(
        rule: ScheduleIndexRow,
        ruleSql: string,
    ): Promise<{ schemaSql: string; records: Record<string, unknown>[]; }[]> {
        const projectConn = await this.hocuspocus.openDirectConnection(rule.room);
        const referenced: { tableId: string; }[] = [];
        try {
            const registry = projectConn.document?.getMap("yjsTables");
            if (!registry) return [];
            const identifiers = parseSqlIdentifiers(ruleSql);
            for (const [tableId, entry] of registry.entries()) {
                if (tableId === rule.target_table_id) continue;
                const sqlName = entry instanceof Y.Map ? String(entry.get("sqlName") ?? "") : "";
                if (!sqlName || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(sqlName)) continue;
                if (identifiers.has(sqlName) || identifiers.has(sqlName.toLowerCase())) referenced.push({ tableId });
            }
        } finally {
            projectConn.disconnect();
        }

        const tables: { schemaSql: string; records: Record<string, unknown>[]; }[] = [];
        for (const { tableId } of referenced) {
            const conn = await this.hocuspocus.openDirectConnection(`${rule.room}/tables/${tableId}`);
            try {
                if (!conn.document) continue;
                const table = this.readTableDoc(conn.document);
                if (table.schemaSql) tables.push(table);
            } finally {
                conn.disconnect();
            }
        }
        return tables;
    }

    /**
     * Run one execution attempt and record its full lifecycle (issue #5290).
     *
     * The start marker is written *before* the job is dispatched, so `Last run`
     * is the instant execution actually began — never the occurrence instant
     * the recurrence produced, never the queue time, and never the completion
     * time the old `lastRunAt` recorded. The terminal result is written on
     * every exit, including a throw, so no attempt is left presented as
     * running by a process that is still alive.
     *
     * The generation is claimed *before* any SQL runs and the job is abandoned
     * if it cannot be: an execution that mutated its target while `Last run`
     * and `Result` still described the previous attempt would be invisible in
     * the manager, and a success it could not publish would be lost from
     * `Last successful run`. Aborting leaves the occurrence unconsumed, so the
     * next tick retries it.
     *
     * `consumes` describes the recurrence cursor this occurrence leaves behind.
     * It is committed to the index and then written into the document *in the
     * same transaction as the terminal result*, so the manager never sees a
     * finished execution paired with the occurrence it just consumed. It is
     * absent for a manual run, which consumes no occurrence.
     */
    private async dispatchJob(
        rule: ScheduleIndexRow,
        occurrenceIso: string,
        ruleSql: string,
        consumes?: { cursor: SchedulerCursor; seq: number; },
    ): Promise<{ success: boolean; error?: string; }> {
        const runSeq = await this.claimRunGeneration(rule.room, rule.rule_id);
        try {
            const result = await this.executeRuleJob(rule, occurrenceIso, ruleSql);
            // A failed statement still consumes its occurrence: the scheduler
            // does not retry one. The index moves first so that a crash before
            // the document write leaves the index authoritative and the indexer
            // republishes it, rather than advertising a cursor already spent.
            //
            // A cursor whose index row no longer exists is not published: the
            // rule's recurrence was removed while this execution was in flight,
            // and the store hook that dropped it has already withdrawn the
            // published cursor. Resurrecting it here would advertise an
            // occurrence nothing will ever honour.
            const cursor = consumes && this.commitIndexCursor(rule.room, rule.rule_id, consumes.cursor, consumes.seq)
                ? consumes.cursor
                : undefined;
            await this.completeRun(rule.room, rule.rule_id, runSeq, result, cursor);
            return result;
        } catch (err: unknown) {
            // The occurrence was not consumed — the job never reached a result —
            // so the cursor stays where it is and this occurrence is retried.
            await this.completeRun(rule.room, rule.rule_id, runSeq, {
                success: false,
                error: err instanceof Error ? err.message : String(err),
            });
            throw err;
        }
    }

    /**
     * Record an execution's outcome durably, then publish it.
     *
     * The outcome is written to SQLite *before* the document is touched, so it
     * is never held only in the memory of the process that produced it. If
     * publication fails — the room cannot be opened, the write cannot be
     * stored — the ledger row survives with the real result on it and the room
     * goes back into the reconciliation queue, which republishes that same
     * outcome (its original completion time included) without re-running any
     * SQL. Without this an execution that succeeded but could not say so would
     * stay `Running` in the manager for the life of the process, even though
     * its work had already been committed to the target table.
     */
    private async completeRun(
        room: string,
        ruleId: string,
        runSeq: number,
        result: { success: boolean; error?: string; },
        cursor?: SchedulerCursor,
    ): Promise<void> {
        const outcome: RunOutcome = {
            status: result.success ? "ok" : "error",
            error: result.success ? undefined : result.error || "Unknown error",
            completedAt: new Date().toISOString(),
            cursor,
        };
        this.recordRunOutcome(room, ruleId, runSeq, outcome);
        await this.markRunFinished(room, ruleId, runSeq, outcome);
    }

    /**
     * Claim the Schedule's telemetry for a new execution attempt.
     *
     * The returned sequence number identifies this attempt. It is bumped under
     * the same transaction that writes the start marker, so a later attempt
     * always owns a higher number and a slow terminal write from an earlier one
     * can be recognised as stale (see `markRunFinished`).
     *
     * Throws when the claim cannot be recorded. The caller must not execute
     * anything in that case: an unclaimed execution can publish neither its
     * start nor its result.
     */
    private async claimRunGeneration(room: string, ruleId: string): Promise<number> {
        const connection = await this.hocuspocus.openDirectConnection(room);
        try {
            const document = connection.document;
            const ruleItem = document?.getMap("schedules").get(ruleId);
            if (!document || !(ruleItem instanceof Y.Map)) {
                throw new Error(`Schedule ${ruleId} is not present in ${room}`);
            }

            // A previous execution whose result never reached the document is
            // settled first. The ledger keeps one row per rule, so claiming
            // over it would erase that result — and with it the successful
            // completion it recorded, which this attempt's own terminal write
            // will not restore if it fails. Settling first preserves that
            // history: `Last successful run` keeps the earlier completion while
            // `Last run` and `Result` go on to describe this attempt.
            const pending = this.owedRuns(room).get(ruleId);

            let runSeq = 0;
            document.transact(() => {
                const currentSeq = (ruleItem.get("lastRunSeq") as number | undefined) ?? 0;
                if (pending?.outcome && pending.runSeq >= currentSeq) {
                    applyRunOutcome(ruleItem, this.outcomeForReplay(room, ruleId, pending.outcome));
                }
                runSeq = Math.max(currentSeq, pending?.runSeq ?? 0) + 1;
                ruleItem.set("lastRunSeq", runSeq);
                ruleItem.set("lastRunStartedAt", new Date().toISOString());
                ruleItem.set("lastRunStatus", "running");
                ruleItem.delete("lastRunError");
            }, SCHEDULER_ORIGIN);
            // Stored before the ledger row is written, and before any SQL runs.
            // Recovery reads the durable document to decide what an owed
            // execution looks like, so a claim that only reached memory would
            // let a crash hide the fact that this generation ever started —
            // while its SQL had already touched the target table. The store is
            // therefore verified, not merely requested: `storeDocumentHooks`
            // resolves even when persistence failed. An unverifiable claim
            // aborts the attempt, like any other unclaimable generation, and
            // leaves the previous execution's record untouched for recovery.
            await this.requestRoomStore(document);
            // A generation *newer* than this one in storage is equally proof
            // that the claim reached it: another writer superseded this attempt
            // immediately, and its result will be dropped by the generation
            // guard rather than lost.
            if (this.canObservePersistence()) {
                const stored = this.storedRunGeneration(room, ruleId);
                if (!stored || stored.seq < runSeq) {
                    throw new Error(`Schedule ${ruleId} in ${room} could not store the start of execution ${runSeq}`);
                }
            }
            this.recordActiveRun(room, ruleId, runSeq);
            return runSeq;
        } finally {
            connection.disconnect();
        }
    }

    /**
     * Write the terminal result of the attempt `runSeq` identifies.
     *
     * A result whose sequence number is no longer the current one belongs to an
     * execution that has already been superseded: writing it would pair an old
     * outcome with a newer start timestamp, so it is dropped instead. Only a
     * successful completion touches `lastSuccessfulRunAt` — a failure or an
     * interruption leaves the previous success standing.
     *
     * The outcome is already durable in the ledger by the time this runs, so a
     * failure here costs a retry rather than the result.
     */
    private async markRunFinished(
        room: string,
        ruleId: string,
        runSeq: number,
        outcome: RunOutcome,
    ): Promise<void> {
        try {
            const connection = await this.hocuspocus.openDirectConnection(room);
            try {
                const document = connection.document;
                const ruleItem = document?.getMap("schedules").get(ruleId);
                if (!document || !(ruleItem instanceof Y.Map)) {
                    // Nothing left to publish this result onto — the Schedule
                    // was deleted. The ledger row would otherwise be retried
                    // forever against a rule that no longer exists.
                    this.clearActiveRun(room, ruleId, runSeq);
                    return;
                }
                if (((ruleItem.get("lastRunSeq") as number | undefined) ?? 0) !== runSeq) {
                    this.clearActiveRun(room, ruleId, runSeq);
                    return;
                }

                document.transact(() => applyRunOutcome(ruleItem, outcome), SCHEDULER_ORIGIN);
                // The document write above only reaches memory — Hocuspocus
                // stores it on a debounce — so a process that died in that
                // window would leave the durable document saying `running`
                // with no record that anything was still owed. The ledger row
                // is that record, so it outlives the write it describes and is
                // dropped only once storage is *observed* to carry the result.
                // Asking for the store is not observing it: the request
                // resolves even when the persistence hook failed.
                await this.requestRoomStore(document);
                if (this.runIsDurablySettled(room, ruleId, runSeq)) {
                    this.clearActiveRun(room, ruleId, runSeq);
                } else {
                    logger.warn(
                        { room, ruleId, runSeq },
                        "Schedule execution result is not durable yet; keeping its recovery record",
                    );
                    this.requeueRoomForReconciliation(room);
                }
            } finally {
                connection.disconnect();
            }
        } catch (err) {
            // The result is safe in the ledger; queue the room so a later tick
            // publishes it rather than leaving the Schedule presented as
            // running until something else happens to reset the process.
            logger.warn({ err, room, ruleId }, "Failed to record schedule execution result; will retry");
            this.requeueRoomForReconciliation(room);
        }
    }

    /**
     * Ask Hocuspocus to flush the room's document to storage.
     *
     * `openDirectConnection` writes into the in-memory document and Hocuspocus
     * persists it on a debounce, so "the transaction returned" is not "the
     * result is durable". Requesting the store is only half of it: this call
     * resolving is **not** proof that it worked. `storeDocumentHooks` catches
     * whatever the persistence hook throws, logs "Document stays in memory to
     * avoid data loss", and resolves normally — a deliberate choice on its
     * part, but it means a caller that trusts the resolution would discard its
     * recovery evidence on the strength of a store that never happened. Every
     * such caller pairs this with `storedRunGeneration` and believes that.
     */
    private async requestRoomStore(document: Y.Doc): Promise<void> {
        const instance = this.hocuspocus as unknown as {
            storeDocumentHooks?: (document: Y.Doc, payload: unknown, immediately?: boolean) => Promise<unknown>;
        };
        if (typeof instance.storeDocumentHooks !== "function") return;
        await instance.storeDocumentHooks(document, {
            clientsCount: 0,
            document,
            documentName: (document as unknown as { name?: string; }).name ?? "",
            instance: this.hocuspocus,
            lastContext: {},
            lastTransactionOrigin: SCHEDULER_ORIGIN,
        }, true);
    }

    /**
     * What the *stored* document says about a Schedule's execution, or
     * `undefined` when nothing readable is stored for it.
     *
     * This is the proof `requestRoomStore` cannot give. The persistence
     * extension writes each document into the `documents` table of the same
     * database this scheduler indexes into — it is where `setDb` got that
     * database from — so the bytes a restart would load are readable here. A
     * generation is only safe to forget once those bytes carry it.
     */
    private storedRunGeneration(
        room: string,
        ruleId: string,
    ): { seq: number; status: string | undefined; } | undefined {
        if (!this.sqliteDb) return undefined;
        const data = (this.sqliteDb.prepare(`SELECT data FROM "documents" WHERE name = ?`)
            .get(room) as { data?: unknown; } | undefined)?.data;
        if (!data) return undefined;
        try {
            const stored = new Y.Doc();
            Y.applyUpdate(stored, new Uint8Array(data as ArrayBufferLike));
            const ruleItem = stored.getMap("schedules").get(ruleId);
            if (!(ruleItem instanceof Y.Map)) return undefined;
            return {
                seq: (ruleItem.get("lastRunSeq") as number | undefined) ?? 0,
                status: ruleItem.get("lastRunStatus") as string | undefined,
            };
        } catch (err) {
            logger.warn({ err, room, ruleId }, "Could not read the stored Schedule document");
            return undefined;
        }
    }

    /**
     * Whether the document store can be read back at all.
     *
     * The proof above depends on the persistence extension keeping documents in
     * the same database the scheduler indexes into, which is how it is deployed
     * (`setDb` takes that database from the SQLite extension). A deployment
     * that persists elsewhere leaves nothing to read, and refusing to run every
     * execution would be a far worse failure than the one the proof prevents —
     * so durability is simply unverifiable there, and the scheduler falls back
     * to the store request's own word. Said out loud, once, rather than
     * silently assumed. Only a positive answer is cached: the extension creates
     * its table before serving, but nothing here depends on that ordering.
     */
    private canObservePersistence(): boolean {
        if (!this.sqliteDb) return false;
        if (this.persistenceIsObservable) return true;
        const table = this.sqliteDb.prepare(`
            SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'documents'
        `).get();
        if (table) {
            this.persistenceIsObservable = true;
            return true;
        }
        if (!this.warnedAboutUnobservablePersistence) {
            this.warnedAboutUnobservablePersistence = true;
            logger.warn(
                "Schedule execution durability cannot be verified: no readable document store. "
                    + "Recovery records will be cleared on the store request alone.",
            );
        }
        return false;
    }

    /** Whether this execution's terminal state has actually reached storage. */
    private runIsDurablySettled(room: string, ruleId: string, runSeq: number): boolean {
        if (!this.canObservePersistence()) return true;
        const stored = this.storedRunGeneration(room, ruleId);
        if (!stored) return false;
        // A newer generation in storage has already superseded this one, so
        // this execution can no longer be presented as running either.
        if (stored.seq > runSeq) return true;
        return stored.seq === runSeq && stored.status !== "running";
    }

    /**
     * The cursor the index holds for a rule *now*, or `undefined` if it holds
     * none. A recorded outcome carries the cursor its execution consumed, which
     * may have been withdrawn since — by an editor clearing the recurrence, say
     * — so a delayed publication takes the cursor from the index rather than
     * from its own memory. The index is the authority; the document mirrors it.
     */
    private currentIndexCursor(room: string, ruleId: string): SchedulerCursor | undefined {
        if (!this.sqliteDb) return undefined;
        const row = this.sqliteDb.prepare(`
            SELECT next_run_at, state FROM schedule_index WHERE room = ? AND rule_id = ?
        `).get(room, ruleId) as { next_run_at: string | null; state: string; } | undefined;
        if (!row) return undefined;
        return { state: row.state as SchedulerCursor["state"], nextRunAt: row.next_run_at };
    }

    /** A recorded outcome, re-aimed at the cursor the index holds now. */
    private outcomeForReplay(room: string, ruleId: string, outcome: RunOutcome): RunOutcome {
        return { ...outcome, cursor: this.currentIndexCursor(room, ruleId) };
    }

    /**
     * Put a room back in line for reconciliation after a publication failure.
     *
     * The startup sweep retires once every room has been swept; an execution
     * that fails to publish afterwards would find no one left to finish it. Its
     * ledger row is still there, so re-arming the sweep is enough to have the
     * next tick pick the result up.
     */
    private requeueRoomForReconciliation(room: string): void {
        this.reconciledInterruptedRuns = false;
        if (!this.roomsAwaitingRunReconciliation) return; // Re-enumerated from the ledger anyway.
        if (!this.roomsAwaitingRunReconciliation.includes(room)) {
            this.roomsAwaitingRunReconciliation.push(room);
        }
    }

    private async executeRuleJob(
        rule: ScheduleIndexRow,
        occurrenceIso: string,
        ruleSql: string,
    ): Promise<{ success: boolean; error?: string; }> {
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
            const dataMap = doc.getMap("data");
            const { schemaSql, records } = this.readTableDoc(doc);
            if (!schemaSql) return { success: true };

            const jobData = {
                ruleId: rule.rule_id,
                schemaSql: schemaSql,
                ruleSql: ruleSql,
                records: records,
                // The target table first, then the tables the SQL reads from.
                tables: [
                    { schemaSql, records },
                    ...await this.loadReferencedTables(rule, ruleSql),
                ],
                timezone: rule.timezone,
                occurrenceUtcIso: occurrenceIso,
            };

            const executed = await this.executor.executeJob(jobData);
            const identityError = executed.success && executed.rows
                ? validateScheduleRowIdentities(executed.rows)
                : undefined;
            const result = identityError
                ? { success: false, error: identityError.message, rows: [] }
                : executed;

            if (!result.success) {
                logger.warn(
                    { ruleId: rule.rule_id, room: rule.room, error: result.error },
                    "Schedule rule SQL failed",
                );
            }

            if (result.success && result.rows && result.rows.length > 0) {
                const schemaDef = parseSchemaString(schemaSql);

                doc.transact(() => {
                    for (const row of result.rows!) {
                        // Identity validation above guarantees every successful
                        // row can be represented by the Yjs record map.
                        const id = row.id!;

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
                        let record = dataMap.get(recordId) as Y.Map<unknown> | undefined;
                        if (!(record instanceof Y.Map)) {
                            record = new Y.Map<unknown>();
                            dataMap.set(recordId, record);
                        }
                        for (const [column, value] of Object.entries(validRow)) {
                            record.set(column, value === undefined ? null : value);
                        }
                        record.set("id", recordId);
                    }
                }, "server-scheduler");
            }

            return { success: result.success, error: result.error };
        } finally {
            directConnection.disconnect();
        }
    }
}
