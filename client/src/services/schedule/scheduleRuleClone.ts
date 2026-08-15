import type { Project } from "$shared/app-schema";
import { validateScheduleRuleSql } from "$shared/services/scheduleRuleValidation";
import type { ScheduleRuleValueType } from "$shared/types/yjs-types";
import * as Y from "yjs";
import { rewriteTableQuerySql } from "../yjstable/tableSqlRewrite";
import { createScheduleRule } from "./scheduleRuleService";

/**
 * A rule that came along with the tables it writes to, and one that could not.
 * Both are reported: a Grid whose rows are generated is correct on the day it
 * is pasted and frozen the day after, so the difference has to be visible.
 */
export interface ScheduleRuleCloneResult {
    /** Rule ids created in the destination, for rollback. */
    createdRuleIds: string[];
    copied: Array<{ sourceTableId: string; ruleName: string; }>;
    skipped: Array<{ sourceTableId: string; ruleName: string; }>;
}

function ruleDisplayName(name: unknown, ruleId: string): string {
    return typeof name === "string" && name.length > 0 ? name : ruleId;
}

/**
 * Copy the schedule rules that write into freshly cloned Grids, disabled.
 *
 * A paste must never start writing to a project's data on a timer the user did
 * not ask for (docs/grid-clipboard-spec.md §9.2), so every copy arrives switched
 * off — enabling it is a deliberate click. Everything else is preserved: the
 * recurrence, its start and timezone, and the catch-up flag, so switching the
 * rule on replays the same history the source has. Run history belongs to the
 * source's runs and is dropped.
 *
 * `sqlNameMap` maps a source SQL relation name to the name it took in the
 * destination, which is how a rule keeps working when `deriveSqlName` had to
 * rename its target or one of the tables it reads.
 */
export function cloneScheduleRules(
    sourceProject: Project,
    destinationProject: Project,
    tableIdMap: Readonly<Record<string, string>>,
    sqlNameMap: ReadonlyMap<string, string>,
): ScheduleRuleCloneResult {
    const result: ScheduleRuleCloneResult = { createdRuleIds: [], copied: [], skipped: [] };

    // Collected before anything is written: source and destination are the same
    // project when Paste Special duplicates a Grid in place, and the new rules
    // must not be re-read as candidates.
    const candidates: Array<{ ruleId: string; rule: Y.Map<ScheduleRuleValueType>; sourceTableId: string; }> = [];
    sourceProject.schedules.forEach((rule, ruleId) => {
        const targetTableId = rule.get("targetTableId");
        if (typeof targetTableId !== "string" || tableIdMap[targetTableId] === undefined) return;
        candidates.push({ ruleId, rule, sourceTableId: targetTableId });
    });

    for (const { ruleId, rule, sourceTableId } of candidates) {
        const ruleName = ruleDisplayName(rule.get("name"), ruleId);
        const sql = rule.get("sql");
        const rrule = rule.get("rrule");
        if (typeof sql !== "string" || typeof rrule !== "string") {
            result.skipped.push({ sourceTableId, ruleName });
            continue;
        }

        let rewrittenSql: string;
        try {
            rewrittenSql = rewriteTableQuerySql(sql, sqlNameMap).sql;
        } catch {
            result.skipped.push({ sourceTableId, ruleName });
            continue;
        }
        // The rewriter understands the relations, not the shape of a rule. A
        // rule the destination would reject is worse than no rule at all, so it
        // is reported as "recreate it here" instead.
        if (!validateScheduleRuleSql(rewrittenSql).valid) {
            result.skipped.push({ sourceTableId, ruleName });
            continue;
        }

        const dtstart = rule.get("dtstart");
        const timezone = rule.get("timezone");
        const catchUp = rule.get("catchUp");
        const createdRuleId = createScheduleRule(destinationProject, {
            name: ruleName,
            targetTableId: tableIdMap[sourceTableId],
            sql: rewrittenSql,
            rrule,
            ...(typeof dtstart === "string" ? { dtstart } : {}),
            ...(typeof timezone === "string" ? { timezone } : {}),
            catchUp: catchUp !== false,
            enabled: false,
        });
        result.createdRuleIds.push(createdRuleId);
        result.copied.push({ sourceTableId, ruleName });
    }

    return result;
}

/**
 * The rule map of a project doc. Named here rather than at each call site so
 * the key stays in step with `Project.schedules`, which the undo router reaches
 * with only a `Y.Doc` in hand.
 */
function scheduleRules(projectDoc: Y.Doc): Y.Map<Y.Map<ScheduleRuleValueType>> {
    return projectDoc.getMap("schedules") as Y.Map<Y.Map<ScheduleRuleValueType>>;
}

/** Remove the rules a paste created, when that paste is rolled back or undone. */
export function rollbackClonedScheduleRules(projectDoc: Y.Doc, ruleIds: readonly string[]): void {
    const rules = scheduleRules(projectDoc);
    projectDoc.transact(() => {
        for (const ruleId of ruleIds) rules.delete(ruleId);
    });
}

/** A flat snapshot of the rules a paste created, so redo can put them back. */
export function captureClonedScheduleRules(
    projectDoc: Y.Doc,
    ruleIds: readonly string[],
): Record<string, Record<string, ScheduleRuleValueType>> {
    const rules = scheduleRules(projectDoc);
    const saved: Record<string, Record<string, ScheduleRuleValueType>> = {};
    for (const ruleId of ruleIds) {
        const rule = rules.get(ruleId);
        if (!rule) continue;
        const fields: Record<string, ScheduleRuleValueType> = {};
        rule.forEach((value, key) => {
            fields[key] = value;
        });
        saved[ruleId] = fields;
    }
    return saved;
}

/** Recreate the rules of `captureClonedScheduleRules` under their own ids. */
export function restoreClonedScheduleRules(
    projectDoc: Y.Doc,
    saved: Readonly<Record<string, Record<string, ScheduleRuleValueType>>>,
): void {
    const rules = scheduleRules(projectDoc);
    projectDoc.transact(() => {
        for (const [ruleId, fields] of Object.entries(saved)) {
            const rule = new Y.Map<ScheduleRuleValueType>();
            for (const [key, value] of Object.entries(fields)) rule.set(key, value);
            rules.set(ruleId, rule);
        }
    });
}
