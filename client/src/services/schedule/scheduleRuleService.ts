import type { Project } from "$shared/app-schema";
import { EXPLICIT_SELECT_ALIAS_POLICY_VERSION } from "$shared/services/explicitSelectAlias";
import { validateScheduleRuleExplicitAliases } from "$shared/services/scheduleRuleValidation";
import type { ScheduleRunStatusValue } from "$shared/services/scheduleStatus";
import type { ScheduleRuleValueType } from "$shared/types/yjs-types";
import { v4 as uuid } from "uuid";
import * as Y from "yjs";
import { globalUndoRouter } from "../undo/undoRouter.svelte";
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
    /**
     * Completion-time observation kept from before the Schedules Manager
     * (issue #5290). It is written after every execution, successful or not,
     * and is never an execution-start time.
     */
    lastRunAt?: string;
    lastRunStatus?: ScheduleRunStatusValue;
    lastRunError?: string;
    /** Wall clock at which the most recent execution attempt began. */
    lastRunStartedAt?: string;
    /** Completion instant of the most recent execution that succeeded. */
    lastSuccessfulRunAt?: string;
    /** Execution generation, bumped by the scheduler on every attempt. */
    lastRunSeq?: number;
    /** The scheduler index state the server mirrors into the rule. */
    schedulerState?: string;
    /** The scheduler's authoritative next occurrence, when it has one. */
    schedulerNextRunAt?: string;
    completedAt?: string;
    validationError?: string;
    skippedOccurrences?: number;
}

/**
 * The half of a Schedule a user edits. Everything outside it — execution
 * telemetry and the scheduler's own cursor — is written by the production
 * scheduler alone (issue #5290).
 */
export type ScheduleRuleConfiguration = Pick<
    ScheduleRule,
    "name" | "targetTableId" | "sql" | "rrule" | "dtstart" | "timezone" | "enabled" | "catchUp"
>;

/**
 * Creates a new schedule rule with default timezone and dtstart.
 */
export function createScheduleRule(
    project: Project,
    options: Partial<ScheduleRule> & { targetTableId: string; sql: string; rrule: string; ruleId?: string; },
): string {
    if (options.sql.trim()) {
        validateScheduleRuleExplicitAliases(options.sql);
    }
    const ruleId = options.ruleId ?? uuid();
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
    ruleMap.set("sqlAliasPolicyVersion", EXPLICIT_SELECT_ALIAS_POLICY_VERSION);
    ruleMap.set("rrule", options.rrule);
    ruleMap.set("dtstart", dtstart);
    ruleMap.set("timezone", timezone);
    ruleMap.set("enabled", options.enabled !== undefined ? options.enabled : true);
    ruleMap.set("catchUp", options.catchUp !== undefined ? options.catchUp : true);

    if (options.name) ruleMap.set("name", options.name);
    if (options.lastRunAt) ruleMap.set("lastRunAt", options.lastRunAt);
    if (options.lastRunStatus) ruleMap.set("lastRunStatus", options.lastRunStatus);
    if (options.lastRunError) ruleMap.set("lastRunError", options.lastRunError);
    if (options.lastRunStartedAt) ruleMap.set("lastRunStartedAt", options.lastRunStartedAt);
    if (options.lastSuccessfulRunAt) ruleMap.set("lastSuccessfulRunAt", options.lastSuccessfulRunAt);
    if (options.lastRunSeq !== undefined) ruleMap.set("lastRunSeq", options.lastRunSeq);
    if (options.schedulerState) ruleMap.set("schedulerState", options.schedulerState);
    if (options.schedulerNextRunAt) ruleMap.set("schedulerNextRunAt", options.schedulerNextRunAt);
    if (options.completedAt) ruleMap.set("completedAt", options.completedAt);
    if (options.validationError) ruleMap.set("validationError", options.validationError);
    if (options.skippedOccurrences) ruleMap.set("skippedOccurrences", options.skippedOccurrences);

    schedulesMap.set(ruleId, ruleMap);

    return ruleId;
}

/**
 * Update the *configuration* of an existing schedule rule.
 *
 * Execution telemetry and scheduler state are deliberately not writable here
 * (issue #5290): `lastRunStartedAt`, `lastRunStatus`, `lastRunError`,
 * `lastRunAt`, `lastSuccessfulRunAt`, `lastRunSeq`, `schedulerState`,
 * `schedulerNextRunAt` and `completedAt` all belong to the production
 * scheduler, which owns their generation guard.
 *
 * The Schedule editor saves by spreading the whole rule it loaded, so a page
 * that loaded before an execution finished would otherwise write that older
 * snapshot back over the newer result — regressing `Last run`, `Result` and
 * `Last successful run` to a superseded execution while leaving the
 * scheduler's `lastRunSeq` untouched. Dropping these fields here makes that
 * unrepresentable rather than merely unlikely: configuration edits and
 * execution telemetry never travel together.
 */
export function updateScheduleRule(
    project: Project,
    ruleId: string,
    updates: Partial<ScheduleRuleConfiguration>,
): void {
    const schedulesMap = project.schedules;
    const ruleMap = schedulesMap.get(ruleId) as Y.Map<ScheduleRuleValueType> | undefined;

    if (!ruleMap) {
        throw new Error(`Schedule rule with id ${ruleId} not found`);
    }
    const sqlChanged = updates.sql !== undefined && updates.sql !== String(ruleMap.get("sql") ?? "");
    if (sqlChanged) {
        validateScheduleRuleExplicitAliases(updates.sql!);
    }

    // Apply updates
    if (updates.name !== undefined) ruleMap.set("name", updates.name);
    if (updates.targetTableId !== undefined) ruleMap.set("targetTableId", updates.targetTableId);
    if (sqlChanged) {
        ruleMap.set("sql", updates.sql!);
        ruleMap.set("sqlAliasPolicyVersion", EXPLICIT_SELECT_ALIAS_POLICY_VERSION);
    }
    if (updates.rrule !== undefined) ruleMap.set("rrule", updates.rrule);
    if (updates.dtstart !== undefined) ruleMap.set("dtstart", updates.dtstart);
    if (updates.timezone !== undefined) ruleMap.set("timezone", updates.timezone);
    if (updates.enabled !== undefined) ruleMap.set("enabled", updates.enabled);
    if (updates.catchUp !== undefined) ruleMap.set("catchUp", updates.catchUp);
    // Scheduler-owned fields are intentionally absent — see the note above.
}

/**
 * Deletes a schedule rule.
 */
export function deleteScheduleRule(project: Project, ruleId: string): void {
    project.schedules.delete(ruleId);
}

/** Read every stored field of one schedule rule into a plain snapshot, or undefined if it does not exist. */
export function getScheduleRule(project: Project, ruleId: string): (ScheduleRule & { id: string; }) | undefined {
    const ruleMap = project.schedules.get(ruleId) as Y.Map<ScheduleRuleValueType> | undefined;
    if (!ruleMap) return undefined;
    return {
        id: ruleId,
        name: ruleMap.get("name") as string | undefined,
        targetTableId: ruleMap.get("targetTableId") as string,
        sql: ruleMap.get("sql") as string,
        rrule: ruleMap.get("rrule") as string,
        dtstart: ruleMap.get("dtstart") as string,
        timezone: ruleMap.get("timezone") as string,
        enabled: ruleMap.get("enabled") as boolean,
        catchUp: ruleMap.get("catchUp") as boolean,
        lastRunAt: ruleMap.get("lastRunAt") as string | undefined,
        lastRunStatus: ruleMap.get("lastRunStatus") as ScheduleRunStatusValue | undefined,
        lastRunError: ruleMap.get("lastRunError") as string | undefined,
        lastRunStartedAt: ruleMap.get("lastRunStartedAt") as string | undefined,
        lastSuccessfulRunAt: ruleMap.get("lastSuccessfulRunAt") as string | undefined,
        lastRunSeq: ruleMap.get("lastRunSeq") as number | undefined,
        schedulerState: ruleMap.get("schedulerState") as string | undefined,
        schedulerNextRunAt: ruleMap.get("schedulerNextRunAt") as string | undefined,
        completedAt: ruleMap.get("completedAt") as string | undefined,
        validationError: ruleMap.get("validationError") as string | undefined,
        skippedOccurrences: ruleMap.get("skippedOccurrences") as number | undefined,
    };
}

/**
 * Delete a schedule rule as one undoable user operation (issue #5119's Object
 * Manager Delete). `deleteScheduleRule` itself is untouched — its other
 * callers keep their existing (untracked) behavior — this wraps it with a
 * manual undo/redo entry the same way `removeGridWithPlacements` and
 * `removeCalendarWithPlacements` do for their registries.
 */
export function deleteScheduleRuleWithUndo(project: Project, ruleId: string): boolean {
    const snapshot = getScheduleRule(project, ruleId);
    if (!snapshot) return false;

    const applyDelete = () => deleteScheduleRule(project, ruleId);
    const applyRestore = () => {
        const { id, ...options } = snapshot;
        createScheduleRule(project, { ...options, ruleId: id });
    };

    globalUndoRouter.captureManual(applyDelete, {
        type: "manual",
        label: `Delete Schedule "${snapshot.name ?? snapshot.id}"`,
        undo: applyRestore,
        redo: applyDelete,
    });

    return true;
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
