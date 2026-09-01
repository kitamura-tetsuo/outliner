import * as rruleImport from "rrule";
import { validateExplicitSelectAliases } from "./explicitSelectAlias.js";

const SCHEDULE_TARGET_PLACEHOLDER = "{{table}}";
const PARSER_SCHEDULE_TARGET = "__outliner_schedule_target__";

/** Validate aliases after replacing the Schedule-only target placeholder in parser input. */
export function validateScheduleRuleExplicitAliases(sql: string): void {
    // This parser-only substitution must never be returned or persisted: validation
    // rejects invalid source instead of formatting or repairing authoritative SQL.
    validateExplicitSelectAliases(sql.split(SCHEDULE_TARGET_PLACEHOLDER).join(PARSER_SCHEDULE_TARGET));
}

// rrule publishes ESM named exports to the client bundler and a CommonJS
// default namespace to the server test loader. Resolve both package shapes.
const RRule = rruleImport.RRule
    ?? (rruleImport as unknown as { default?: { RRule?: typeof rruleImport.RRule; }; }).default?.RRule;

/**
 * Validates the SQL part of a schedule rule.
 *
 * Rules:
 * - Must be a single statement.
 * - Must be exactly an `INSERT ... RETURNING *` or `WITH ... INSERT ... RETURNING *` statement.
 */
export function validateScheduleRuleSql(
    sql: string,
    requireExplicitAliases = true,
): { valid: boolean; error?: string; } {
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

    if (requireExplicitAliases) {
        try {
            validateScheduleRuleExplicitAliases(trimmed);
        } catch (error) {
            return { valid: false, error: error instanceof Error ? error.message : String(error) };
        }
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
