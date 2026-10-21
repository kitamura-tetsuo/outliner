import { loadModule, parseSync, scanSync } from "libpg-query";
import * as rruleImport from "rrule";
import { validateExplicitSelectAliases } from "./explicitSelectAlias.js";

const SCHEDULE_TARGET_PLACEHOLDER = "{{table}}";
const PARSER_SCHEDULE_TARGET = "__outliner_schedule_target__";

await loadModule();

/** Replace scanner-visible placeholder tokens, never occurrences inside literals or comments. */
function scheduleParserSql(sql: string): string {
    const tokens = scanSync(sql).tokens;
    const replacements: Array<{ start: number; end: number; }> = [];
    for (let index = 0; index <= tokens.length - 5; index++) {
        const group = tokens.slice(index, index + 5);
        if (group.map(token => token.text.toLowerCase()).join("") === SCHEDULE_TARGET_PLACEHOLDER) {
            replacements.push({ start: group[0]!.start, end: group[4]!.end });
            index += 4;
        }
    }
    // Scanner spans are UTF-8 byte offsets, not JavaScript UTF-16 indices.
    // Apply replacements to encoded bytes so non-ASCII text before a target
    // placeholder cannot shift or corrupt the parser-only copy.
    let result = new TextEncoder().encode(sql);
    const replacementBytes = new TextEncoder().encode(PARSER_SCHEDULE_TARGET);
    for (const replacement of replacements.reverse()) {
        const next = new Uint8Array(result.length - (replacement.end - replacement.start) + replacementBytes.length);
        next.set(result.slice(0, replacement.start));
        next.set(replacementBytes, replacement.start);
        next.set(result.slice(replacement.end), replacement.start + replacementBytes.length);
        result = next;
    }
    return new TextDecoder().decode(result);
}

/** Validate aliases after replacing the Schedule-only target placeholder in parser input. */
export function validateScheduleRuleExplicitAliases(sql: string): void {
    // This parser-only substitution must never be returned or persisted: validation
    // rejects invalid source instead of formatting or repairing authoritative SQL.
    validateExplicitSelectAliases(scheduleParserSql(sql));
}

function getRRuleFallback(mod: unknown): typeof rruleImport.RRule | undefined {
    // A trick to bypass Vite's static analysis of the 'default' export.
    return (mod as { [key: string]: { RRule?: typeof rruleImport.RRule; } | undefined; })["defa" + "ult"]?.RRule;
}

// rrule publishes ESM named exports to the client bundler and a CommonJS
// default namespace to the server test loader. Resolve both package shapes.
const RRule = rruleImport.RRule ?? getRRuleFallback(rruleImport);

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

    try {
        const parsed = parseSync(scheduleParserSql(trimmed));
        if (parsed.stmts?.length !== 1) return { valid: false, error: "Query must contain exactly one statement" };
        const statement = parsed.stmts[0]?.stmt as Record<string, unknown> | undefined;
        const insert = statement?.InsertStmt as Record<string, unknown> | undefined;
        if (!insert) return { valid: false, error: "Query must be an INSERT statement" };
        const returning = (insert.returningClause as { exprs?: unknown[]; } | undefined)?.exprs;
        const target = returning?.[0] as
            | { ResTarget?: { val?: { ColumnRef?: { fields?: unknown[]; }; }; }; }
            | undefined;
        const fields = target?.ResTarget?.val?.ColumnRef?.fields;
        const wildcard = fields?.length === 1 && Boolean((fields[0] as { A_Star?: unknown; } | undefined)?.A_Star);
        if (returning?.length !== 1 || !wildcard) {
            return { valid: false, error: "Query must end with RETURNING *" };
        }
        if (requireExplicitAliases) validateScheduleRuleExplicitAliases(trimmed);
    } catch (error) {
        return { valid: false, error: error instanceof Error ? error.message : String(error) };
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
