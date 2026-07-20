import { onStoreDocumentPayload } from "@hocuspocus/server";
import type BetterSqlite3 from "better-sqlite3";
import { DateTime } from "luxon";
import rrulePkg from "rrule";
const { rrulestr } = rrulePkg;
import * as Y from "yjs";



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

        let rule: any;
        try {
            rule = rrulestr(rruleStr, { dtstart: rruleDtstart });
        } catch (e: any) {
            return { next_run_at: null, state: "invalid", nextSeq: cursorSeq, error: e.message };
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
    } catch (err: any) {
        return { next_run_at: null, state: "invalid", nextSeq: cursorSeq, error: err.message };
    }
}

export function handleStoreDocumentForSchedules(data: onStoreDocumentPayload, db: BetterSqlite3.Database) {
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

        schedulesMap.forEach((ruleObj: any, ruleId: string) => {
            currentRuleIds.add(ruleId);
            if (!(ruleObj instanceof Y.Map)) return;

            const rruleStr = ruleObj.get("rrule") as string;
            const dtstartStr = ruleObj.get("dtstart") as string;
            const timezoneStr = ruleObj.get("timezone") as string;
            const targetTableId = ruleObj.get("targetTableId") as string;
            const enabled = ruleObj.get("enabled") as boolean ?? true;

            if (!rruleStr || !dtstartStr || !timezoneStr) {
                return;
            }

            const existingRow = getRow.get(documentName, ruleId) as any;

            let seq = 0;
            if (existingRow) {
                // Check if we need to recompute
                if (
                    existingRow.rrule === rruleStr && existingRow.dtstart === dtstartStr
                    && existingRow.timezone === timezoneStr
                ) {
                    const targetTableChanged = existingRow.target_table_id !== (targetTableId || null);
                    seq = existingRow.occurrence_seq;
                    if (!enabled && existingRow.state !== "disabled") {
                        upsertRow.run(
                            documentName,
                            ruleId,
                            targetTableId || null,
                            timezoneStr,
                            rruleStr,
                            dtstartStr,
                            existingRow.next_run_at,
                            seq,
                            "disabled",
                        );
                        return;
                    } else if (enabled && existingRow.state === "disabled") {
                        // Fall through to recompute/update state to active
                    } else if (enabled) {
                        if (targetTableChanged) {
                            upsertRow.run(
                                documentName,
                                ruleId,
                                targetTableId || null,
                                timezoneStr,
                                rruleStr,
                                dtstartStr,
                                existingRow.next_run_at,
                                seq,
                                existingRow.state,
                            );
                            return;
                        }
                        return; // Nothing changed, active -> active
                    }
                } else {
                    seq = 0; // Reset on change
                }
            }

            if (!enabled) {
                upsertRow.run(
                    documentName,
                    ruleId,
                    targetTableId || null,
                    timezoneStr,
                    rruleStr,
                    dtstartStr,
                    existingRow?.next_run_at || null,
                    seq,
                    "disabled",
                );
                return;
            }

            const computed = computeNextRunAt(rruleStr, dtstartStr, timezoneStr, seq);

            let finalState = computed.state;

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

            upsertRow.run(
                documentName,
                ruleId,
                targetTableId || null,
                timezoneStr,
                rruleStr,
                dtstartStr,
                computed.next_run_at,
                computed.nextSeq,
                finalState,
            );
        });

        // Delete deleted schedules
        for (const dbRuleId of dbRuleIds) {
            if (!currentRuleIds.has(dbRuleId)) {
                deleteRow.run(documentName, dbRuleId);
            }
        }
    })();
}
