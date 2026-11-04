import * as Y from "yjs";
import { validateScheduleRuleSql } from "../../../shared/src/services/scheduleRuleValidation.js";
import { serializeScheduleSqlDiagnostic } from "../../../shared/src/services/scheduleSqlDiagnostics.js";
import { SCHEDULER_ORIGIN } from "./schedule-status-publisher.js";

export interface EvaluatedScheduleSql {
    sql: string;
    strictAliases: boolean;
    validation: { valid: boolean; error?: string; };
}

/** Validate the live saved definition and project its rejection into that same rule. */
export function validateAndPublishScheduleSql(document: Y.Doc, ruleId: string): EvaluatedScheduleSql | undefined {
    const schedules = document.getMap("schedules");
    const rule = schedules.get(ruleId);
    if (!(rule instanceof Y.Map)) return undefined;
    const sql = String(rule.get("sql") ?? "");
    const strictAliases = rule.get("sqlAliasPolicyVersion") === 1;
    const validation = validateScheduleRuleSql(sql, strictAliases);
    const value = validation.valid
        ? undefined
        : serializeScheduleSqlDiagnostic(sql, strictAliases, validation.error ?? "Invalid Schedule SQL");

    if (schedules.get(ruleId) !== rule) return undefined;
    document.transact(() => {
        if (value === undefined) {
            if (rule.get("sqlValidationDiagnostic") !== undefined) rule.delete("sqlValidationDiagnostic");
        } else if (rule.get("sqlValidationDiagnostic") !== value) rule.set("sqlValidationDiagnostic", value);
    }, SCHEDULER_ORIGIN);
    return { sql, strictAliases, validation };
}
