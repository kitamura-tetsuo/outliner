import { projectBasePath } from "./publicProject";

/**
 * The single reserved project-page segment. Everything under
 * `/:project/-/...` is Outliner's own project-management namespace; every
 * other `/:project/:page` segment is a user page title. Centralized here so
 * route guards and page-creation validation share one definition instead of
 * duplicating the literal string.
 */
export const MANAGEMENT_SEGMENT = "-";

/** True when `segment` is the reserved management-namespace path/page name. */
export function isReservedPageSegment(segment: string | null | undefined): boolean {
    return segment === MANAGEMENT_SEGMENT;
}

/** The project-management landing page: `/:project/-`. */
export function projectManagementPath(projectName: string): string {
    return `${projectBasePath(projectName)}/${MANAGEMENT_SEGMENT}`;
}

/** The Object Manager: `/:project/-/objects`. */
export function projectObjectsPath(projectName: string): string {
    return `${projectManagementPath(projectName)}/objects`;
}

/** The OPML/Markdown import-export panel: `/:project/-/import-export`. */
export function projectImportExportPath(projectName: string): string {
    return `${projectManagementPath(projectName)}/import-export`;
}

/** Project title/sharing settings: `/:project/-/settings`. */
export function projectSettingsPath(projectName: string): string {
    return `${projectManagementPath(projectName)}/settings`;
}

/** The project's link graph: `/:project/-/graph`. */
export function projectGraphPath(projectName: string): string {
    return `${projectManagementPath(projectName)}/graph`;
}

/** The Table list: `/:project/-/tables`. */
export function projectTablesPath(projectName: string): string {
    return `${projectManagementPath(projectName)}/tables`;
}

/** One standalone Table page: `/:project/-/tables/:tableId`. */
export function projectTablePath(projectName: string, tableId: string): string {
    return `${projectTablesPath(projectName)}/${encodeURIComponent(tableId)}`;
}

/** The Grid list: `/:project/-/grids`. */
export function projectGridsPath(projectName: string): string {
    return `${projectManagementPath(projectName)}/grids`;
}

/** One standalone Grid page: `/:project/-/grids/:gridId`. */
export function projectGridPath(projectName: string, gridId: string): string {
    return `${projectGridsPath(projectName)}/${encodeURIComponent(gridId)}`;
}

/** The Calendar list: `/:project/-/calendars`. */
export function projectCalendarsPath(projectName: string): string {
    return `${projectManagementPath(projectName)}/calendars`;
}

/** One standalone Calendar page: `/:project/-/calendars/:calendar`. */
export function projectCalendarPath(projectName: string, calendarName: string): string {
    return `${projectCalendarsPath(projectName)}/${encodeURIComponent(calendarName)}`;
}

/** The Schedule (scheduled SQL) list: `/:project/-/schedules`. */
export function projectSchedulesPath(projectName: string): string {
    return `${projectManagementPath(projectName)}/schedules`;
}

/** One Schedule rule editor: `/:project/-/schedules/:ruleId`. */
export function projectSchedulePath(projectName: string, ruleId: string): string {
    return `${projectSchedulesPath(projectName)}/${encodeURIComponent(ruleId)}`;
}
