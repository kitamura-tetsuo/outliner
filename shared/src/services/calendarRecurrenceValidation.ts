import { rrulestr } from "rrule";
import { getLogger } from "../logger.js";
import { parseWallTime } from "../utils/zonedTime.js";
const logger = getLogger("calendarRecurrenceValidation");

// Validation for calendar-item recurrence (RRULE/DTSTART/timezone on an
// `Item`, per docs/crdt-sql-architecture.md §6.2). Deliberately not shared
// with `scheduleRuleValidation.ts`: the two mechanisms stay decoupled per
// the issue this implements, even though the checks look similar.

/**
 * Validates the RRULE body string (RFC 5545, no `RRULE:` prefix required).
 */
export function validateRecurrenceRRule(rruleStr: string): { valid: boolean; error?: string; } {
    if (!rruleStr) {
        return { valid: false, error: "RRULE is empty" };
    }
    try {
        // A fixed, arbitrary dtstart: only the rule body's own syntax is
        // being checked here, not its interaction with a real dtstart.
        rrulestr(rruleStr, { dtstart: new Date(Date.UTC(2026, 0, 1)) });
        return { valid: true };
    } catch (err: unknown) {
        return { valid: false, error: `Invalid RRULE: ${err instanceof Error ? err.message : String(err)}` };
    }
}

/** Validates a timezone is a valid IANA timezone. */
export function validateRecurrenceTimezone(timezone: string): { valid: boolean; error?: string; } {
    if (!timezone) {
        return { valid: false, error: "Timezone is required" };
    }
    try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone });
        return { valid: true };
    } catch (_e) {
        logger.warn({ err: _e }, "Silenced error");
        return { valid: false, error: "Invalid IANA timezone" };
    }
}

/**
 * Validates that dtstart is a local wall-clock datetime string
 * (`YYYY-MM-DDTHH:MM:SS`, no `Z`/offset) — recurring plans store wall clock
 * plus zone, never a UTC instant (§6.1).
 */
export function validateRecurrenceDtstart(dtstart: string): { valid: boolean; error?: string; } {
    if (!dtstart) {
        return { valid: false, error: "dtstart is required" };
    }
    if (!parseWallTime(dtstart)) {
        return {
            valid: false,
            error: "dtstart must be a local wall-clock datetime string (e.g. 2026-07-20T09:00:00)",
        };
    }
    return { valid: true };
}
