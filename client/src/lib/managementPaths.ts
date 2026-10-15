import { resolve } from "$app/paths";
import type { ResolvedPathname } from "$app/types";
import { isPublicProject, projectBasePath } from "./publicProject";

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

/** The Kanban list: `/:project/-/kanbans`. */
export function projectKanbansPath(projectName: string): string {
    return `${projectManagementPath(projectName)}/kanbans`;
}

/** One standalone Kanban page, addressed by stable definition identity. */
export function projectKanbanPath(projectName: string, kanbanId: string): string {
    return `${projectKanbansPath(projectName)}/${encodeURIComponent(kanbanId)}`;
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

/** The Project SQL type catalog: `/:project/-/types`. */
export function projectTypesPath(projectName: string): string {
    return `${projectManagementPath(projectName)}/types`;
}

// ---------------------------------------------------------------------------
// Typed SvelteKit resolutions.
//
// Each `*Route` below is byte-identical to its `*Path` sibling for accepted
// inputs: the project and entity id are encoded once per parameter (never the
// whole URL, never twice), and the configured application base is applied
// once by `resolve`. A registered demo slug resolves through its matcher
// route wherever the demo tree has a twin; destinations without a demo twin
// (import-export, settings, types) resolve through the generic route, which is
// the same destination the previous string builder produced. The official
// `ResolvedPathname` result is retained so incorrect route IDs or parameter
// names fail type checking. Callers guard transient empty identities rather
// than manufacturing an unresolved string with a resolved-path cast.
// ---------------------------------------------------------------------------

/** The project-management landing page as a typed SvelteKit resolution. */
export function projectManagementRoute(projectName: string): ResolvedPathname {
    if (isPublicProject(projectName)) {
        return resolve("/[demoProject=demoProject]/-", { demoProject: encodeURIComponent(projectName) });
    }
    return resolve("/[project]/-", { project: encodeURIComponent(projectName) });
}

/** The Object Manager as a typed SvelteKit resolution. */
export function projectObjectsRoute(projectName: string): ResolvedPathname {
    if (isPublicProject(projectName)) {
        return resolve("/[demoProject=demoProject]/-/objects", { demoProject: encodeURIComponent(projectName) });
    }
    return resolve("/[project]/-/objects", { project: encodeURIComponent(projectName) });
}

/**
 * The Object Manager with a preselected object as a typed SvelteKit
 * resolution. `selected` is the raw query value (for example comma-joined
 * object ids); it is encoded once into the query, matching the previous
 * `` `${projectObjectsPath(...)}?selected=${encodeURIComponent(...)}` ``
 * construction.
 */
export function projectObjectsSelectedRoute(
    projectName: string,
    selected: string,
): ResolvedPathname {
    const query: `?selected=${string}` = `?selected=${encodeURIComponent(selected)}`;
    // `resolve` only accepts a literal route ID from the generated RouteId
    // union, so the query is appended after resolution instead of being
    // embedded in the route ID.
    if (isPublicProject(projectName)) {
        return `${
            resolve("/[demoProject=demoProject]/-/objects", {
                demoProject: encodeURIComponent(projectName),
            })
        }${query}`;
    }
    return `${resolve("/[project]/-/objects", { project: encodeURIComponent(projectName) })}${query}`;
}

/** The OPML/Markdown import-export panel as a typed SvelteKit resolution. */
export function projectImportExportRoute(projectName: string): ResolvedPathname {
    return resolve("/[project]/-/import-export", { project: encodeURIComponent(projectName) });
}

/** Project title/sharing settings as a typed SvelteKit resolution. */
export function projectSettingsRoute(projectName: string): ResolvedPathname {
    return resolve("/[project]/-/settings", { project: encodeURIComponent(projectName) });
}

/** The project's link graph as a typed SvelteKit resolution. */
export function projectGraphRoute(projectName: string): ResolvedPathname {
    if (isPublicProject(projectName)) {
        return resolve("/[demoProject=demoProject]/-/graph", { demoProject: encodeURIComponent(projectName) });
    }
    return resolve("/[project]/-/graph", { project: encodeURIComponent(projectName) });
}

/** The Table list as a typed SvelteKit resolution. */
export function projectTablesRoute(projectName: string): ResolvedPathname {
    if (isPublicProject(projectName)) {
        return resolve("/[demoProject=demoProject]/-/tables", { demoProject: encodeURIComponent(projectName) });
    }
    return resolve("/[project]/-/tables", { project: encodeURIComponent(projectName) });
}

/** One standalone Table page as a typed SvelteKit resolution. */
export function projectTableRoute(projectName: string, tableId: string): ResolvedPathname {
    const id = encodeURIComponent(tableId);
    if (isPublicProject(projectName)) {
        return resolve("/[demoProject=demoProject]/-/tables/[tableId]", {
            demoProject: encodeURIComponent(projectName),
            tableId: id,
        });
    }
    return resolve("/[project]/-/tables/[tableId]", { project: encodeURIComponent(projectName), tableId: id });
}

/** The Grid list as a typed SvelteKit resolution. */
export function projectGridsRoute(projectName: string): ResolvedPathname {
    if (isPublicProject(projectName)) {
        return resolve("/[demoProject=demoProject]/-/grids", { demoProject: encodeURIComponent(projectName) });
    }
    return resolve("/[project]/-/grids", { project: encodeURIComponent(projectName) });
}

/** One standalone Grid page as a typed SvelteKit resolution. */
export function projectGridRoute(projectName: string, gridId: string): ResolvedPathname {
    const id = encodeURIComponent(gridId);
    if (isPublicProject(projectName)) {
        return resolve("/[demoProject=demoProject]/-/grids/[gridId]", {
            demoProject: encodeURIComponent(projectName),
            gridId: id,
        });
    }
    return resolve("/[project]/-/grids/[gridId]", { project: encodeURIComponent(projectName), gridId: id });
}

/** The Kanban list as a typed SvelteKit resolution. */
export function projectKanbansRoute(projectName: string): ResolvedPathname {
    if (isPublicProject(projectName)) {
        return resolve("/[demoProject=demoProject]/-/kanbans", { demoProject: encodeURIComponent(projectName) });
    }
    return resolve("/[project]/-/kanbans", { project: encodeURIComponent(projectName) });
}

/** One standalone Kanban page as a typed SvelteKit resolution. */
export function projectKanbanRoute(projectName: string, kanbanId: string): ResolvedPathname {
    const id = encodeURIComponent(kanbanId);
    if (isPublicProject(projectName)) {
        return resolve("/[demoProject=demoProject]/-/kanbans/[kanbanId]", {
            demoProject: encodeURIComponent(projectName),
            kanbanId: id,
        });
    }
    return resolve("/[project]/-/kanbans/[kanbanId]", { project: encodeURIComponent(projectName), kanbanId: id });
}

/** The Calendar list as a typed SvelteKit resolution. */
export function projectCalendarsRoute(projectName: string): ResolvedPathname {
    if (isPublicProject(projectName)) {
        return resolve("/[demoProject=demoProject]/-/calendars", { demoProject: encodeURIComponent(projectName) });
    }
    return resolve("/[project]/-/calendars", { project: encodeURIComponent(projectName) });
}

/** One standalone Calendar page as a typed SvelteKit resolution. */
export function projectCalendarRoute(projectName: string, calendarName: string): ResolvedPathname {
    const calendar = encodeURIComponent(calendarName);
    if (isPublicProject(projectName)) {
        return resolve("/[demoProject=demoProject]/-/calendars/[calendar]", {
            demoProject: encodeURIComponent(projectName),
            calendar,
        });
    }
    return resolve("/[project]/-/calendars/[calendar]", {
        project: encodeURIComponent(projectName),
        calendar,
    });
}

/** The Schedule list as a typed SvelteKit resolution. */
export function projectSchedulesRoute(projectName: string): ResolvedPathname {
    if (isPublicProject(projectName)) {
        return resolve("/[demoProject=demoProject]/-/schedules", { demoProject: encodeURIComponent(projectName) });
    }
    return resolve("/[project]/-/schedules", { project: encodeURIComponent(projectName) });
}

/** One Schedule rule editor as a typed SvelteKit resolution. */
export function projectScheduleRoute(projectName: string, ruleId: string): ResolvedPathname {
    const id = encodeURIComponent(ruleId);
    if (isPublicProject(projectName)) {
        return resolve("/[demoProject=demoProject]/-/schedules/[ruleId]", {
            demoProject: encodeURIComponent(projectName),
            ruleId: id,
        });
    }
    return resolve("/[project]/-/schedules/[ruleId]", { project: encodeURIComponent(projectName), ruleId: id });
}

/** The Project SQL type catalog as a typed SvelteKit resolution. */
export function projectTypesRoute(projectName: string): ResolvedPathname {
    return resolve("/[project]/-/types", { project: encodeURIComponent(projectName) });
}
