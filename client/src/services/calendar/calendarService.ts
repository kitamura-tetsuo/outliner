// Yjs data model for the calendar feature.
//
// A calendar has a query and view settings and no data of its own, so unlike
// a table it needs no subdoc: a flat `calendars` Y.Map on the project doc
// (id -> Y.Map of settings) holds it, in the same shape `schedules` already
// uses (see scheduleRuleService.ts). See docs/crdt-sql-architecture.md §6.6.

import type { Project } from "$shared/app-schema";
import type { CalendarValueType } from "$shared/types/yjs-types";
import { v4 as uuid } from "uuid";
import * as Y from "yjs";
import { globalUndoRouter } from "../undo/undoRouter";

export const DEFAULT_CALENDAR_VIEW_TYPE = "week";

/** The four fixed roles a calendar assigns over its query's result columns. */
export type CalendarRoleKey = "roleTitle" | "roleStart" | "roleAllDay" | "roleDuration";

/** Wall-clock minutes-from-midnight default for the grid's working-hours band: 09:00. */
export const DEFAULT_WORKING_HOURS_START_MINUTES = 9 * 60;
/** Wall-clock minutes-from-midnight default for the grid's working-hours band: 18:00. */
export const DEFAULT_WORKING_HOURS_END_MINUTES = 18 * 60;

export interface CalendarSettings {
    name: string;
    query: string;
    viewType: string;
    timezone?: string;
    roleTitle?: string;
    roleStart?: string;
    roleAllDay?: string;
    roleDuration?: string;
    /** Deadline role (#4341's `due`): rendered as a marker, never a block (§6.1/§4347). */
    roleDue?: string;
    /** Zero or more result columns to group entries by. */
    groupAxes: string[];
    /** 0 (Sunday) .. 6 (Saturday). Undefined means "use the locale's default". */
    weekStart?: number;
    /** Minutes from midnight where the time-grid's initial scroll lands. */
    workingHoursStartMinutes?: number;
    /** Minutes from midnight where the working-hours band ends. */
    workingHoursEndMinutes?: number;
}

export interface CalendarListEntry {
    id: string;
    settings: CalendarSettings;
}

const calendarUndoManagers = new WeakMap<Y.Doc, Y.UndoManager>();

/**
 * Ensure a `Y.UndoManager` scoped to the `calendars` map exists and is
 * registered with the global router, so every create/update/delete below is
 * undoable (docs/crdt-sql-architecture.md §4.6). Idempotent and lazy, mirroring
 * how `tableDocs.ts` creates a table's undo manager on first access.
 */
export function ensureCalendarUndoManager(project: Project): Y.UndoManager {
    const doc = project.ydoc;
    let undo = calendarUndoManagers.get(doc);
    if (!undo) {
        undo = new Y.UndoManager(project.calendars, { trackedOrigins: new Set([null]) });
        calendarUndoManagers.set(doc, undo);
        globalUndoRouter.register(undo);
    }
    return undo;
}

/** Test/teardown hook: mirrors `destroyTableUndoManager` in tableDocs.ts. */
export function destroyCalendarUndoManager(doc: Y.Doc): void {
    const undo = calendarUndoManagers.get(doc);
    if (undo) {
        globalUndoRouter.unregister(undo);
        undo.destroy();
        calendarUndoManagers.delete(doc);
    }
}

/** The registry map in the project doc: calendarId -> Y.Map of settings. */
export function getCalendarMap(project: Project, calendarId: string): Y.Map<CalendarValueType> | undefined {
    return project.calendars.get(calendarId);
}

function readCalendarSettings(calendarMap: Y.Map<CalendarValueType>): CalendarSettings {
    const groupAxesValue = calendarMap.get("groupAxes");
    return {
        name: String(calendarMap.get("name") ?? ""),
        query: String(calendarMap.get("query") ?? ""),
        viewType: String(calendarMap.get("viewType") ?? DEFAULT_CALENDAR_VIEW_TYPE),
        timezone: calendarMap.get("timezone") as string | undefined,
        roleTitle: calendarMap.get("roleTitle") as string | undefined,
        roleStart: calendarMap.get("roleStart") as string | undefined,
        roleAllDay: calendarMap.get("roleAllDay") as string | undefined,
        roleDuration: calendarMap.get("roleDuration") as string | undefined,
        roleDue: calendarMap.get("roleDue") as string | undefined,
        groupAxes: groupAxesValue instanceof Y.Array ? groupAxesValue.toArray() : [],
        weekStart: calendarMap.get("weekStart") as number | undefined,
        workingHoursStartMinutes: calendarMap.get("workingHoursStartMinutes") as number | undefined,
        workingHoursEndMinutes: calendarMap.get("workingHoursEndMinutes") as number | undefined,
    };
}

export function getCalendar(project: Project, calendarId: string): CalendarSettings | undefined {
    const calendarMap = getCalendarMap(project, calendarId);
    return calendarMap ? readCalendarSettings(calendarMap) : undefined;
}

export function listCalendars(project: Project): CalendarListEntry[] {
    const entries: CalendarListEntry[] = [];
    project.calendars.forEach((calendarMap, id) => {
        entries.push({ id, settings: readCalendarSettings(calendarMap) });
    });
    return entries;
}

/**
 * Create a new calendar. Returns the new calendar id.
 */
export function createCalendar(
    project: Project,
    options: Partial<CalendarSettings> & { name: string; },
): string {
    ensureCalendarUndoManager(project);
    const calendarId = uuid();
    const calendarMap = new Y.Map<CalendarValueType>();

    calendarMap.set("name", options.name);
    calendarMap.set("query", options.query ?? "");
    calendarMap.set("viewType", options.viewType ?? DEFAULT_CALENDAR_VIEW_TYPE);
    if (options.timezone) calendarMap.set("timezone", options.timezone);
    if (options.roleTitle) calendarMap.set("roleTitle", options.roleTitle);
    if (options.roleStart) calendarMap.set("roleStart", options.roleStart);
    if (options.roleAllDay) calendarMap.set("roleAllDay", options.roleAllDay);
    if (options.roleDuration) calendarMap.set("roleDuration", options.roleDuration);
    if (options.roleDue) calendarMap.set("roleDue", options.roleDue);
    if (options.weekStart !== undefined) calendarMap.set("weekStart", options.weekStart);
    if (options.workingHoursStartMinutes !== undefined) {
        calendarMap.set("workingHoursStartMinutes", options.workingHoursStartMinutes);
    }
    if (options.workingHoursEndMinutes !== undefined) {
        calendarMap.set("workingHoursEndMinutes", options.workingHoursEndMinutes);
    }

    const groupAxes = new Y.Array<string>();
    if (options.groupAxes && options.groupAxes.length > 0) groupAxes.push(options.groupAxes);
    calendarMap.set("groupAxes", groupAxes);

    project.calendars.set(calendarId, calendarMap);
    return calendarId;
}

function setOrClear(calendarMap: Y.Map<CalendarValueType>, key: string, value: string | undefined): void {
    if (value === undefined || value === "") calendarMap.delete(key);
    else calendarMap.set(key, value);
}

function setOrClearNumber(calendarMap: Y.Map<CalendarValueType>, key: string, value: number | undefined): void {
    if (value === undefined) calendarMap.delete(key);
    else calendarMap.set(key, value);
}

function ensureGroupAxesArray(calendarMap: Y.Map<CalendarValueType>): Y.Array<string> {
    const existing = calendarMap.get("groupAxes");
    if (existing instanceof Y.Array) return existing as Y.Array<string>;
    const groupAxes = new Y.Array<string>();
    calendarMap.set("groupAxes", groupAxes);
    return groupAxes;
}

/**
 * Update settings of an existing calendar. Only the provided keys are
 * touched — an update never prunes a role/group-axis assignment that simply
 * was not part of this call (the candidate list a query returns may change
 * independently; see the role editor).
 */
export function updateCalendar(
    project: Project,
    calendarId: string,
    updates: Partial<CalendarSettings>,
): void {
    ensureCalendarUndoManager(project);
    const calendarMap = getCalendarMap(project, calendarId);
    if (!calendarMap) throw new Error(`Calendar with id ${calendarId} not found`);

    project.ydoc.transact(() => {
        if (updates.name !== undefined) calendarMap.set("name", updates.name);
        if (updates.query !== undefined) calendarMap.set("query", updates.query);
        if (updates.viewType !== undefined) calendarMap.set("viewType", updates.viewType);
        if (updates.timezone !== undefined) setOrClear(calendarMap, "timezone", updates.timezone);
        if (updates.roleTitle !== undefined) setOrClear(calendarMap, "roleTitle", updates.roleTitle);
        if (updates.roleStart !== undefined) setOrClear(calendarMap, "roleStart", updates.roleStart);
        if (updates.roleAllDay !== undefined) setOrClear(calendarMap, "roleAllDay", updates.roleAllDay);
        if (updates.roleDuration !== undefined) setOrClear(calendarMap, "roleDuration", updates.roleDuration);
        if (updates.roleDue !== undefined) setOrClear(calendarMap, "roleDue", updates.roleDue);
        if (updates.weekStart !== undefined) setOrClearNumber(calendarMap, "weekStart", updates.weekStart);
        if (updates.workingHoursStartMinutes !== undefined) {
            setOrClearNumber(calendarMap, "workingHoursStartMinutes", updates.workingHoursStartMinutes);
        }
        if (updates.workingHoursEndMinutes !== undefined) {
            setOrClearNumber(calendarMap, "workingHoursEndMinutes", updates.workingHoursEndMinutes);
        }
        if (updates.groupAxes !== undefined) {
            const groupAxes = ensureGroupAxesArray(calendarMap);
            if (groupAxes.length > 0) groupAxes.delete(0, groupAxes.length);
            if (updates.groupAxes.length > 0) groupAxes.push(updates.groupAxes);
        }
    });
}

export function deleteCalendar(project: Project, calendarId: string): void {
    ensureCalendarUndoManager(project);
    project.calendars.delete(calendarId);
}

/**
 * Subscribe to changes on the calendars registry: any calendar created,
 * edited or deleted. Mirrors the observeDeep mirror pattern (AGENTS.md §11)
 * rather than polling. Returns an unsubscribe function.
 */
export function observeCalendars(project: Project, onChange: () => void): () => void {
    const handler = () => onChange();
    project.calendars.observeDeep(handler);
    return () => project.calendars.unobserveDeep(handler);
}
