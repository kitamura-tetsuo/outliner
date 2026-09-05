import { onStoreDocumentPayload } from "@hocuspocus/server";
import type BetterSqlite3 from "better-sqlite3";
import { DateTime } from "luxon";
import { default as rruleImport, RRule } from "rrule";
import * as Y from "yjs";
import { applyLegacyTelemetryMigration, applySchedulerCursor, SCHEDULER_ORIGIN } from "./schedule-status-publisher.js";

export interface ScheduleIndexRow {
    room: string;
    rule_id: string;
    target_table_id: string | null;
    timezone: string;
    rrule: string;
    dtstart: string;
    next_run_at: string | null;
    occurrence_seq: number;
    /**
     * `completed` and `orphaned` are written by the scheduler itself once a
     * recurrence is exhausted or its rule loses its SQL; the indexer only ever
     * produces the first four.
     */
    state: "active" | "disabled" | "exhausted" | "invalid" | "completed" | "orphaned";
}

const { rrulestr } = rruleImport;

// The SQLite extension opens its database asynchronously (its onConfigure
// hook is not awaited), so there is no single point at startup where the
// database is guaranteed to exist. Every entry point that touches the index
// therefore ensures it once per database.
const initializedDatabases = new WeakSet<object>();

export function ensureScheduleIndex(db: BetterSqlite3.Database) {
    if (initializedDatabases.has(db)) return;
    initializeScheduleIndex(db);
    initializedDatabases.add(db);
}

export function initializeScheduleIndex(db: BetterSqlite3.Database) {
    db.prepare(`
        CREATE TABLE IF NOT EXISTS schedule_index (
            room            TEXT,
            rule_id         TEXT,
            target_table_id TEXT,
            timezone        TEXT,
            rrule           TEXT,
            dtstart         TEXT,
            next_run_at     TEXT,
            occurrence_seq  INTEGER,
            state           TEXT,
            PRIMARY KEY (room, rule_id)
        )
    `).run();

    // Executions that have claimed a telemetry generation but not yet written
    // a terminal result. A row that outlives its process is how the restarted
    // scheduler finds the Schedule to reconcile — including a `Run now`
    // execution of a rule that has no recurrence index row at all, which the
    // recurrence index could never point at (issue #5290 REQ-009).
    db.prepare(`
        CREATE TABLE IF NOT EXISTS schedule_active_runs (
            room     TEXT,
            rule_id  TEXT,
            run_seq  INTEGER,
            PRIMARY KEY (room, rule_id)
        )
    `).run();
}

export function computeNextRunAt(
    rruleStr: string,
    dtstartStr: string,
    timezoneStr: string,
    cursorSeq: number = 0,
): {
    next_run_at: string | null;
    state: "active" | "disabled" | "exhausted" | "invalid";
    nextSeq: number;
    error?: string;
} {
    try {
        const dtstart = DateTime.fromISO(dtstartStr, { zone: timezoneStr });
        if (!dtstart.isValid) {
            return { next_run_at: null, state: "invalid", nextSeq: cursorSeq, error: "Invalid dtstart" };
        }

        const originalLocal = dtstartStr;
        const resolvedLocal = dtstart.toFormat("yyyy-MM-dd'T'HH:mm:ss");

        if (originalLocal !== resolvedLocal) {
            return {
                next_run_at: null,
                state: "invalid",
                nextSeq: cursorSeq,
                error: "Invalid dtstart (nonexistent time in timezone)",
            };
        }

        // rrule expects floating time; we give it local time (treating it as UTC for rrule's purposes)
        const rruleDtstart = new Date(
            Date.UTC(dtstart.year, dtstart.month - 1, dtstart.day, dtstart.hour, dtstart.minute, dtstart.second),
        );

        let rule: RRule;
        try {
            rule = rrulestr(rruleStr, { dtstart: rruleDtstart }) as RRule;
        } catch (e: unknown) {
            return {
                next_run_at: null,
                state: "invalid",
                nextSeq: cursorSeq,
                error: e instanceof Error ? e.message : String(e),
            };
        }

        let nextDate: Date | null = null;
        let occurrencesFound = 0;

        rule.all((date: Date, i: number) => {
            const year = date.getUTCFullYear();
            const month = date.getUTCMonth() + 1;
            const day = date.getUTCDate();
            const hour = date.getUTCHours();
            const minute = date.getUTCMinutes();
            const second = date.getUTCSeconds();

            const localDateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${
                String(hour).padStart(2, "0")
            }:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;

            // Check if nonexistent local time
            const inZone = DateTime.fromISO(localDateStr, { zone: timezoneStr });
            const resolvedLocalDateStr = inZone.setZone(timezoneStr, { keepLocalTime: true }).toFormat(
                "yyyy-MM-dd'T'HH:mm:ss",
            );
            if (localDateStr !== resolvedLocalDateStr) {
                // Nonexistent local time! Skip to next valid occurrence.
                return true; // continue iterating
            }

            if (occurrencesFound === cursorSeq) {
                nextDate = date;
                return false; // stop iterating
            }
            occurrencesFound++;
            return true; // continue iterating
        });

        if (!nextDate) {
            return { next_run_at: null, state: "exhausted", nextSeq: cursorSeq };
        }

        const dt = DateTime.fromObject({
            year: (nextDate as Date).getUTCFullYear(),
            month: (nextDate as Date).getUTCMonth() + 1,
            day: (nextDate as Date).getUTCDate(),
            hour: (nextDate as Date).getUTCHours(),
            minute: (nextDate as Date).getUTCMinutes(),
            second: (nextDate as Date).getUTCSeconds(),
        }, { zone: timezoneStr });

        return { next_run_at: dt.toUTC().toISO(), state: "active", nextSeq: cursorSeq };
    } catch (err: unknown) {
        return {
            next_run_at: null,
            state: "invalid",
            nextSeq: cursorSeq,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}

/**
 * Return bounded occurrences strictly after an instant in one recurrence
 * traversal. This uses the same floating-local-time and DST-gap rules as the
 * scheduler cursor calculation, without an arbitrary historical scan cap.
 */
export function computeOccurrencesAfter(
    rruleStr: string,
    dtstartStr: string,
    timezoneStr: string,
    afterEpochMs: number,
    limit: number,
): string[] {
    const dtstart = DateTime.fromISO(dtstartStr, { zone: timezoneStr });
    if (!dtstart.isValid || dtstartStr !== dtstart.toFormat("yyyy-MM-dd'T'HH:mm:ss")) return [];
    const rule = rrulestr(rruleStr, {
        dtstart: new Date(Date.UTC(
            dtstart.year,
            dtstart.month - 1,
            dtstart.day,
            dtstart.hour,
            dtstart.minute,
            dtstart.second,
        )),
    }) as RRule;
    const occurrences: string[] = [];
    rule.all(date => {
        const local = DateTime.fromObject({
            year: date.getUTCFullYear(),
            month: date.getUTCMonth() + 1,
            day: date.getUTCDate(),
            hour: date.getUTCHours(),
            minute: date.getUTCMinutes(),
            second: date.getUTCSeconds(),
        }, { zone: timezoneStr });
        const expected = DateTime.fromJSDate(date, { zone: "utc" }).toFormat("yyyy-MM-dd'T'HH:mm:ss");
        if (!local.isValid || local.toFormat("yyyy-MM-dd'T'HH:mm:ss") !== expected) return true;
        const iso = local.toUTC().toISO()!;
        if (Date.parse(iso) > afterEpochMs) occurrences.push(iso);
        return occurrences.length < limit;
    });
    return occurrences;
}

export function handleStoreDocumentForSchedules(data: onStoreDocumentPayload, db: BetterSqlite3.Database) {
    ensureScheduleIndex(db);

    const documentName = data.documentName;
    const document = data.document;

    // get schedules map
    const schedulesMap = document.getMap("schedules");
    if (!schedulesMap) {
        return;
    }

    const currentRuleIds = new Set<string>();

    const getRow = db.prepare(`SELECT * FROM schedule_index WHERE room = ? AND rule_id = ?`);
    const deleteRow = db.prepare(`DELETE FROM schedule_index WHERE room = ? AND rule_id = ?`);
    const upsertRow = db.prepare(`
        INSERT INTO schedule_index (room, rule_id, target_table_id, timezone, rrule, dtstart, next_run_at, occurrence_seq, state)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(room, rule_id) DO UPDATE SET
            target_table_id = excluded.target_table_id,
            timezone = excluded.timezone,
            rrule = excluded.rrule,
            dtstart = excluded.dtstart,
            next_run_at = excluded.next_run_at,
            occurrence_seq = excluded.occurrence_seq,
            state = excluded.state
    `);

    db.transaction(() => {
        // Find existing schedules in DB to determine what to delete
        const currentSchedulesInDbStmt = db.prepare(`SELECT rule_id FROM schedule_index WHERE room = ?`);
        const currentSchedulesInDb = currentSchedulesInDbStmt.all(documentName) as { rule_id: string; }[];
        const dbRuleIds = new Set(currentSchedulesInDb.map(r => r.rule_id));

        schedulesMap.forEach((ruleObj: unknown, ruleId: string) => {
            if (!(ruleObj instanceof Y.Map)) return;

            const rruleStr = ruleObj.get("rrule") as string;
            const dtstartStr = ruleObj.get("dtstart") as string;
            const timezoneStr = ruleObj.get("timezone") as string;
            const targetTableId = ruleObj.get("targetTableId") as string;
            const enabled = ruleObj.get("enabled") as boolean ?? true;
            const sqlStr = ruleObj.get("sql") as string;

            if (!rruleStr || !dtstartStr || !timezoneStr || !sqlStr) {
                // The rule is missing something the scheduler needs, so its
                // index row is dropped below and it will never run. Whatever
                // cursor it published while it was still complete has to be
                // withdrawn with it: leaving `active` and the old occurrence
                // in the document would keep the manager advertising a next
                // run nothing will ever honour (issue #5290 REQ-006).
                const state = !sqlStr ? "orphaned" : "invalid";
                document.transact(() => {
                    applySchedulerCursor(ruleObj, { state, nextRunAt: null });
                    applyLegacyTelemetryMigration(ruleObj);
                }, SCHEDULER_ORIGIN);
                return;
            }

            currentRuleIds.add(ruleId);

            const existingRow = getRow.get(documentName, ruleId) as ScheduleIndexRow | undefined;

            const recurrenceUnchanged = !!existingRow
                && existingRow.rrule === rruleStr
                && existingRow.dtstart === dtstartStr
                && existingRow.timezone === timezoneStr;
            // The cursor survives an edit that leaves the recurrence alone
            // (a renamed rule, a new target table); anything else restarts it.
            const seq = recurrenceUnchanged ? existingRow!.occurrence_seq : 0;

            let cursor: { next_run_at: string | null; seq: number; state: ScheduleIndexRow["state"]; };

            if (!enabled) {
                // A disabled rule keeps its stored cursor so that re-enabling it
                // resumes where it stopped instead of replaying from dtstart.
                cursor = { next_run_at: existingRow?.next_run_at ?? null, seq, state: "disabled" };
            } else if (recurrenceUnchanged && existingRow!.state !== "disabled") {
                // Already indexed and still running on the same recurrence: the
                // scheduler owns the cursor from here on (it advances it on
                // every tick), so re-deriving it here would undo catch-up and
                // overdue state. Only the denormalised columns are refreshed.
                cursor = { next_run_at: existingRow!.next_run_at, seq, state: existingRow!.state };
            } else {
                const computed = computeNextRunAt(rruleStr, dtstartStr, timezoneStr, seq);

                // Transaction origin: server-scheduler (per spec)
                document.transact(() => {
                    // Write back validation error if invalid
                    if (computed.state === "invalid" && computed.error) {
                        if (ruleObj.get("validationError") !== computed.error) {
                            ruleObj.set("validationError", computed.error);
                        }
                    } else if (ruleObj.get("validationError") !== undefined) {
                        ruleObj.delete("validationError");
                    }

                    if (computed.state === "exhausted") {
                        if (!ruleObj.get("completedAt")) {
                            ruleObj.set("completedAt", new Date().toISOString());
                        }
                    }
                }, "server-scheduler");

                cursor = { next_run_at: computed.next_run_at, seq: computed.nextSeq, state: computed.state };
            }

            upsertRow.run(
                documentName,
                ruleId,
                targetTableId || null,
                timezoneStr,
                rruleStr,
                dtstartStr,
                cursor.next_run_at,
                cursor.seq,
                cursor.state,
            );

            // The Schedules Manager reads `Next run` from the document, so the
            // index state is mirrored back on every store — including the
            // "nothing changed" path, which is the only one a long-lived
            // Schedule ever takes after its first indexing (issue #5290).
            document.transact(() => {
                applySchedulerCursor(ruleObj, { state: cursor.state, nextRunAt: cursor.next_run_at });
                applyLegacyTelemetryMigration(ruleObj);
            }, SCHEDULER_ORIGIN);
        });

        // Delete deleted schedules
        for (const dbRuleId of dbRuleIds) {
            if (!currentRuleIds.has(dbRuleId)) {
                deleteRow.run(documentName, dbRuleId);
            }
        }
    })();
}
