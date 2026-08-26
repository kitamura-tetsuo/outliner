import type { Project } from "$shared/app-schema";
import type { ScheduleRuleValueType } from "$shared/types/yjs-types";
import { v4 as uuid } from "uuid";
import * as Y from "yjs";
import { parseIdentifiers } from "../yjstable/queryAnalysis";
import { listTables } from "../yjstable/tableDocs";

/**
 * Interface representing a schedule rule config
 * Note: Rule SQL must generate a deterministic `id` column for idempotent re-runs.
 * `current_setting('job.occurrence')::timestamptz` is the scheduled occurrence time; using `now()` is discouraged.
 */
export interface ScheduleRule {
    name?: string;
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
    skippedOccurrences?: number;
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

    if (options.name) ruleMap.set("name", options.name);
    if (options.lastRunAt) ruleMap.set("lastRunAt", options.lastRunAt);
    if (options.lastRunStatus) ruleMap.set("lastRunStatus", options.lastRunStatus);
    if (options.lastRunError) ruleMap.set("lastRunError", options.lastRunError);
    if (options.completedAt) ruleMap.set("completedAt", options.completedAt);
    if (options.validationError) ruleMap.set("validationError", options.validationError);
    if (options.skippedOccurrences) ruleMap.set("skippedOccurrences", options.skippedOccurrences);

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
    if (updates.name !== undefined) ruleMap.set("name", updates.name);
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
    if (updates.skippedOccurrences !== undefined) ruleMap.set("skippedOccurrences", updates.skippedOccurrences);
}

/**
 * Deletes a schedule rule.
 */
export function deleteScheduleRule(project: Project, ruleId: string): void {
    project.schedules.delete(ruleId);
}

/**
 * How one Schedule reaches one Table.
 *
 * A Schedule is a project-level entity: no Table owns it, and it may touch
 * several Tables in a single run (read A, write B). `write-target` is the
 * Table its result rows are written back into; `sql-reference` is any other
 * Table its statement names. Both are references — neither implies ownership.
 */
export type ScheduleTableReferenceKind = "write-target" | "sql-reference";

export interface ScheduleTableReference {
    ruleId: string;
    ruleName: string;
    kind: ScheduleTableReferenceKind;
    enabled: boolean;
}

/** Every Table id one Schedule references, write target and SQL alike. */
export function scheduleTableReferences(
    project: Project | undefined,
    ruleId: string,
): { tableId: string; kind: ScheduleTableReferenceKind; }[] {
    const ruleMap = project?.schedules?.get(ruleId);
    if (!project || !ruleMap) return [];

    const references: { tableId: string; kind: ScheduleTableReferenceKind; }[] = [];
    const seen = new Set<string>();

    const targetTableId = ruleMap.get("targetTableId");
    if (typeof targetTableId === "string" && targetTableId) {
        references.push({ tableId: targetTableId, kind: "write-target" });
        seen.add(targetTableId);
    }

    const sql = ruleMap.get("sql");
    if (typeof sql === "string" && sql) {
        const identifiers = parseIdentifiers(sql);
        for (const table of listTables(project.ydoc)) {
            if (!table.sqlName || seen.has(table.tableId)) continue;
            if (identifiers.has(table.sqlName.toLowerCase()) || identifiers.has(table.sqlName)) {
                references.push({ tableId: table.tableId, kind: "sql-reference" });
                seen.add(table.tableId);
            }
        }
    }

    return references;
}

/**
 * Schedules that reference a Table — as their write target or by naming its
 * SQL relation. Used to render a Table's dependency list, which is explicitly
 * a "used by" list and never a child list.
 */
export function findSchedulesReferencingTable(
    project: Project | undefined,
    tableId: string,
): ScheduleTableReference[] {
    if (!project?.schedules) return [];

    const targetSqlName = listTables(project.ydoc).find(t => t.tableId === tableId)?.sqlName;
    const references: ScheduleTableReference[] = [];

    project.schedules.forEach((ruleMap, ruleId) => {
        const ruleName = (ruleMap.get("name") as string | undefined) || "Untitled Schedule";
        const enabled = ruleMap.get("enabled") !== false;

        if (ruleMap.get("targetTableId") === tableId) {
            references.push({ ruleId, ruleName, kind: "write-target", enabled });
            return;
        }

        if (!targetSqlName) return;
        const sql = ruleMap.get("sql") as string | undefined;
        if (!sql) return;
        const identifiers = parseIdentifiers(sql);
        if (identifiers.has(targetSqlName.toLowerCase()) || identifiers.has(targetSqlName)) {
            references.push({ ruleId, ruleName, kind: "sql-reference", enabled });
        }
    });

    return references;
}

export function listSchedules(project: Project): { id: string; name: string; }[] {
    if (!project?.schedules) return [];

    const schedules: { id: string; name: string; }[] = [];
    project.schedules.forEach((ruleMap, id) => {
        schedules.push({
            id,
            name: (ruleMap.get("name") as string) || "",
        });
    });
    return schedules;
}

export function renameSchedule(project: Project, ruleId: string, name: string): void {
    const ruleMap = project.schedules.get(ruleId) as Y.Map<ScheduleRuleValueType> | undefined;
    if (ruleMap) ruleMap.set("name", name);
}
