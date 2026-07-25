import { RRule } from "rrule";

/**
 * Validates the SQL part of a schedule rule.
 *
 * Rules:
 * - Must be a single statement.
 * - Must be exactly an `INSERT ... RETURNING *` or `WITH ... INSERT ... RETURNING *` statement.
 */
export function validateScheduleRuleSql(sql: string): { valid: boolean; error?: string; } {
    const trimmed = (sql ?? "").trim();
    if (!trimmed) {
        return { valid: false, error: "SQL is empty" };
    }

    const stripped = trimmed
        .replace(/--[^\n]*/g, " ")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/'(?:[^']|'')*'/g, "''")
        .replace(/"(?:[^"]|"")*"/g, '""')
        .trim();

    if (!/^\s*(with|insert)\b/i.test(stripped)) {
        return { valid: false, error: "Query must start with INSERT or WITH" };
    }

    if (!/\binsert\b/i.test(stripped)) {
        return { valid: false, error: "Query must contain an INSERT statement" };
    }

    if (!/\breturning\s+\*/i.test(stripped)) {
        return { valid: false, error: "Query must end with RETURNING *" };
    }

    const withoutTrailing = stripped.replace(/;\s*$/, "");
    if (withoutTrailing.includes(";")) {
        return { valid: false, error: "Query must contain exactly one statement" };
    }

    return { valid: true };
}

/**
 * Validates the RRULE body string (RFC 5545).
 *
 * Rules:
 * - Must parse successfully.
 * - FREQ must be HOURLY or coarser (MINUTELY / SECONDLY rejected).
 */
export function validateScheduleRuleRRule(rruleStr: string): { valid: boolean; error?: string; } {
    if (!rruleStr) {
        return { valid: false, error: "RRULE is empty" };
    }

    // Some implementations prefix with RRULE:, we should just parse the string
    let ruleStr = rruleStr;
    if (!ruleStr.toUpperCase().startsWith("RRULE:")) {
        ruleStr = "RRULE:" + ruleStr;
    }

    try {
        const rule = RRule.fromString(ruleStr);
        if (rule.options.freq === RRule.MINUTELY || rule.options.freq === RRule.SECONDLY) {
            return { valid: false, error: "FREQ must be HOURLY or coarser" };
        }
        return { valid: true };
    } catch (err: unknown) {
        return { valid: false, error: `Invalid RRULE: ${err instanceof Error ? err.message : String(err)}` };
    }
}

/**
 * Validates a timezone is a valid IANA timezone.
 */
export function validateScheduleRuleTimezone(timezone: string): { valid: boolean; error?: string; } {
    if (!timezone) {
        return { valid: false, error: "Timezone is required" };
    }

    try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone });
        return { valid: true };
    } catch (e) {
        return { valid: false, error: "Invalid IANA timezone" };
    }
}

/**
 * Validates that dtstart parses as a local wall-clock datetime.
 * Format expected: YYYY-MM-DDTHH:MM:SS (without timezone offset)
 */
export function validateScheduleRuleDtstart(dtstart: string): { valid: boolean; error?: string; } {
    if (!dtstart) {
        return { valid: false, error: "dtstart is required" };
    }

    // Must be a string without Z or offset, e.g. "2026-07-20T09:00:00"
    const regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
    if (!regex.test(dtstart)) {
        return { valid: false, error: "dtstart must be a local wall-clock datetime string (e.g. 2026-07-20T09:00:00)" };
    }

    const date = new Date(dtstart + "Z");
    if (isNaN(date.getTime())) {
        return { valid: false, error: "Invalid dtstart date" };
    }

    return { valid: true };
}
