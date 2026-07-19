import { SQLite } from "@hocuspocus/extension-sqlite";
import { RRule, RRuleSet, rrulestr } from "rrule";
import { DateTime } from "luxon";
import * as Y from "yjs";

export function initializeScheduleIndex(db: any) {
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
