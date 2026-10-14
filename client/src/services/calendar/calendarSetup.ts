import { Project } from "$shared/app-schema";
import type * as Y from "yjs";
import { sqlNameError } from "../yjstable/sqlNames";
import { getTableRegistry, listTables } from "../yjstable/tableDocs";
import { createTableOnlyFromPreset, type TablePreset } from "../yjstable/tablePresets";
import { getItemCalendarId, setItemCalendarId } from "./calendarBinding";
import { createCalendar, getCalendar } from "./calendarService";

interface CalendarPlacement {
    ydoc: Y.Doc;
    tree: { getNodeValueFromKey: (key: string) => unknown; };
    key: string;
}

export interface CalendarSetupAuthorization {
    projectAccess: boolean;
    surfaceWritable: boolean;
}

function requireLiveDestination(item: CalendarPlacement, authorization: CalendarSetupAuthorization): void {
    if (!authorization.projectAccess) throw new Error("Project access is unavailable.");
    if (!authorization.surfaceWritable) throw new Error("The destination is read-only.");
    const value = item.tree.getNodeValueFromKey(item.key) as
        | { get?: (key: string) => unknown; set?: unknown; }
        | undefined;
    if (!value?.get || typeof value.set !== "function") throw new Error("The Calendar placement no longer exists.");
    if (value.get("componentType") !== "calendar") {
        throw new Error("The destination is no longer a Calendar placement.");
    }
    if (getItemCalendarId(item)) throw new Error("The Calendar placement has already been bound.");
}

function bindNewCalendar(
    item: CalendarPlacement,
    authorization: CalendarSetupAuthorization,
    options: Parameters<typeof createCalendar>[1],
): string {
    requireLiveDestination(item, authorization);
    const project = Project.fromDoc(item.ydoc);
    const calendarId = createCalendar(project, options);
    setItemCalendarId(item, calendarId);
    return calendarId;
}

export function createIndependentCalendar(
    item: CalendarPlacement,
    name: string,
    authorization: CalendarSetupAuthorization,
): string {
    return bindNewCalendar(item, authorization, { name: name.trim() || "Calendar" });
}

export function bindExistingCalendar(
    item: CalendarPlacement,
    selectedCalendarId: string,
    authorization: CalendarSetupAuthorization,
): string {
    requireLiveDestination(item, authorization);
    if (!getCalendar(Project.fromDoc(item.ydoc), selectedCalendarId)) {
        throw new Error("The selected Calendar is no longer available. Choose an existing Calendar.");
    }
    setItemCalendarId(item, selectedCalendarId);
    return selectedCalendarId;
}

export function createCalendarWithNewTable(
    item: CalendarPlacement,
    input: { preset: TablePreset; name: string; sqlName: string; },
    authorization: CalendarSetupAuthorization,
): { tableId: string; calendarId: string; } {
    requireLiveDestination(item, authorization);
    const invalid = sqlNameError(input.sqlName);
    if (invalid) throw new Error(invalid);
    if (listTables(item.ydoc).some(table => table.sqlName === input.sqlName)) {
        throw new Error(`SQL name "${input.sqlName}" is already used in this project`);
    }

    // Evaluate user/preset code before publishing either registry object.
    input.preset.schemaSql(input.sqlName);
    const query = input.preset.query(input.sqlName);
    const roles = input.preset.key === "habits"
        ? { roleTitle: "name" }
        : input.preset.key === "tasks"
        ? { roleTitle: "title", roleDue: "due_date" }
        : { roleTitle: "title" };

    let tableId = "";
    let calendarId = "";
    item.ydoc.transact(() => {
        requireLiveDestination(item, authorization);
        tableId = createTableOnlyFromPreset(item.ydoc, input.preset, input.name, input.sqlName);
        calendarId = bindNewCalendar(item, authorization, { name: input.name, query, ...roles });
    });
    return { tableId, calendarId };
}

export function createCalendarOverExistingTable(
    item: CalendarPlacement,
    selected: { tableId: string; sqlName: string; },
    calendarName: string,
    authorization: CalendarSetupAuthorization,
): string {
    requireLiveDestination(item, authorization);
    const table = listTables(item.ydoc).find(candidate => candidate.tableId === selected.tableId);
    if (!table || !getTableRegistry(item.ydoc).has(selected.tableId)) {
        throw new Error("The selected Table is no longer available. Choose an existing Table.");
    }
    if (table.sqlName !== selected.sqlName) {
        throw new Error("The selected Table changed after selection. Select the current Table again.");
    }
    const invalid = sqlNameError(table.sqlName);
    if (invalid) throw new Error(`The selected Table's current SQL name is unsuitable: ${invalid}`);
    return bindNewCalendar(item, authorization, {
        name: calendarName.trim() || `${table.name || "Table"} Calendar`,
        query: `SELECT * FROM ${table.sqlName}`,
    });
}
