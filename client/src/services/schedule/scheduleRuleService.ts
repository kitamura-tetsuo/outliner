import type { Project } from "$shared/app-schema";
import type { ScheduleRuleValueType } from "$shared/types/yjs-types";
import { v4 as uuid } from "uuid";
import * as Y from "yjs";

/**
 * Interface representing a schedule rule config
 * Note: Rule SQL must generate a deterministic `id` column for idempotent re-runs.
 * `current_setting('job.occurrence')::timestamptz` is the scheduled occurrence time; using `now()` is discouraged.
 */
export interface ScheduleRule {
    targetTableId: string;
    sql: string;
    rrule: string;
    dtstart: string;
    timezone: string;
    enabled: boolean;
    catchUp: boolean;
    lastRunAt?: string;
    lastRunStatus?: "ok" | "error";
    lastRunError?: string;
    completedAt?: string;
    validationError?: string;
}

/**
 * Creates a new schedule rule with default timezone and dtstart.
 */
export function createScheduleRule(
    project: Project,
    options: Partial<ScheduleRule> & { targetTableId: string; sql: string; rrule: string; },
): string {
    const ruleId = uuid();
    const schedulesMap = project.schedules;
    const ruleMap = new Y.Map<ScheduleRuleValueType>();

    // Set defaults
    const timezone = options.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const now = new Date();
    // format as local wall-clock time: YYYY-MM-DDTHH:mm:ss
    const tzOffset = now.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(now.getTime() - tzOffset)).toISOString().slice(0, 19);
    const dtstart = options.dtstart || localISOTime;

    ruleMap.set("targetTableId", options.targetTableId);
    ruleMap.set("sql", options.sql);
    ruleMap.set("rrule", options.rrule);
    ruleMap.set("dtstart", dtstart);
    ruleMap.set("timezone", timezone);
    ruleMap.set("enabled", options.enabled !== undefined ? options.enabled : true);
    ruleMap.set("catchUp", options.catchUp !== undefined ? options.catchUp : true);

    if (options.lastRunAt) ruleMap.set("lastRunAt", options.lastRunAt);
    if (options.lastRunStatus) ruleMap.set("lastRunStatus", options.lastRunStatus);
    if (options.lastRunError) ruleMap.set("lastRunError", options.lastRunError);
    if (options.completedAt) ruleMap.set("completedAt", options.completedAt);
    if (options.validationError) ruleMap.set("validationError", options.validationError);

    schedulesMap.set(ruleId, ruleMap);

    return ruleId;
}

/**
 * Updates an existing schedule rule.
 */
export function updateScheduleRule(
    project: Project,
    ruleId: string,
    updates: Partial<ScheduleRule>,
): void {
    const schedulesMap = project.schedules;
    const ruleMap = schedulesMap.get(ruleId) as Y.Map<ScheduleRuleValueType> | undefined;

    if (!ruleMap) {
        throw new Error(`Schedule rule with id ${ruleId} not found`);
    }

    // Apply updates
    if (updates.targetTableId !== undefined) ruleMap.set("targetTableId", updates.targetTableId);
    if (updates.sql !== undefined) ruleMap.set("sql", updates.sql);
    if (updates.rrule !== undefined) ruleMap.set("rrule", updates.rrule);
    if (updates.dtstart !== undefined) ruleMap.set("dtstart", updates.dtstart);
    if (updates.timezone !== undefined) ruleMap.set("timezone", updates.timezone);
    if (updates.enabled !== undefined) ruleMap.set("enabled", updates.enabled);
    if (updates.catchUp !== undefined) ruleMap.set("catchUp", updates.catchUp);
    if (updates.lastRunAt !== undefined) ruleMap.set("lastRunAt", updates.lastRunAt);
    if (updates.lastRunStatus !== undefined) ruleMap.set("lastRunStatus", updates.lastRunStatus);
    if (updates.lastRunError !== undefined) ruleMap.set("lastRunError", updates.lastRunError);
    if (updates.completedAt !== undefined) ruleMap.set("completedAt", updates.completedAt);
    if (updates.validationError !== undefined) ruleMap.set("validationError", updates.validationError);
}

/**
 * Deletes a schedule rule.
 */
export function deleteScheduleRule(project: Project, ruleId: string): void {
    project.schedules.delete(ruleId);
}
