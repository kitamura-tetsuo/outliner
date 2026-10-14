import { resolve } from "$app/paths";
import type { ResolvedPathname } from "$app/types";
import { demoProjectFromPath, isDemoProjectSlug } from "$shared/demoProjects";

export { demoProjectFromPath };

/**
 * Public projects are readable by anonymous visitors. Today those are exactly
 * the demo projects — one per locale (`demo`, and the localized siblings listed
 * in shared/src/demoProjects.ts). The standalone table, schedule and calendar
 * routes all need the same predicate, so it lives here rather than being
 * re-derived in every route.
 */
export function isPublicProject(projectName: string | undefined): boolean {
    return isDemoProjectSlug(projectName);
}

/**
 * The base path of a project's pages.
 *
 * Every project — demo or not — lives under its own name, because a demo's
 * slug *is* its first URL segment (see shared/src/demoProjects.ts). Callers
 * used to special-case `demo` here; that branch produced the same string as
 * this one and became actively wrong once `/demo-ja` existed.
 */
export function projectBasePath(projectName: string): string {
    return `/${encodeURIComponent(projectName)}`;
}

/** The path of one page inside a project. */
export function projectPagePath(projectName: string, pageTitle: string): string {
    return `${projectBasePath(projectName)}/${encodeURIComponent(pageTitle)}`;
}

/**
 * The project landing route as a typed SvelteKit resolution.
 *
 * A registered demo slug resolves through its matcher route; every other
 * project resolves through the generic route. Either way the produced URL is
 * byte-identical to {@link projectBasePath}: each segment is encoded once,
 * and the configured application base is applied once by `resolve`.
 */
export function projectRoute(projectName: string): ResolvedPathname {
    // The legacy builder never threw for degenerate inputs, and render paths
    // can evaluate this while a name is transiently empty (for example while
    // clearing a title). Keep producing that same string instead of letting
    // the typed resolver's missing-parameter error crash the component.
    if (!projectName) return projectBasePath(projectName) as ResolvedPathname;
    if (isPublicProject(projectName)) {
        return resolve("/[demoProject=demoProject]", { demoProject: encodeURIComponent(projectName) });
    }
    return resolve("/[project]", { project: encodeURIComponent(projectName) });
}

/**
 * One page inside a project as a typed SvelteKit resolution.
 *
 * Byte-identical to {@link projectPagePath} for accepted inputs: the project
 * and page are encoded per parameter (never the whole URL, never twice), so
 * Japanese/non-ASCII text, spaces and URL-sensitive characters (`/`, `%`,
 * `?`, `#`) keep their established representation, and a registered demo
 * slug such as `demo-ja` keeps its own segment.
 */
export function projectPageRoute(projectName: string, pageTitle: string): ResolvedPathname {
    if (!projectName || !pageTitle) return projectPagePath(projectName, pageTitle) as ResolvedPathname;
    const page = encodeURIComponent(pageTitle);
    if (isPublicProject(projectName)) {
        return resolve("/[demoProject=demoProject]/[page]", { demoProject: encodeURIComponent(projectName), page });
    }
    return resolve("/[project]/[page]", { project: encodeURIComponent(projectName), page });
}

/** The page-history/diff route as a typed SvelteKit resolution. */
export function projectPageDiffRoute(projectName: string, pageTitle: string): ResolvedPathname {
    if (!projectName || !pageTitle) return `${projectPagePath(projectName, pageTitle)}/diff` as ResolvedPathname;
    const page = encodeURIComponent(pageTitle);
    if (isPublicProject(projectName)) {
        return resolve("/[demoProject=demoProject]/[page]/diff", {
            demoProject: encodeURIComponent(projectName),
            page,
        });
    }
    return resolve("/[project]/[page]/diff", { project: encodeURIComponent(projectName), page });
}

/**
 * The page-schedule route as a typed SvelteKit resolution.
 *
 * The demo tree has no page-schedule twin, so demo slugs fall through to the
 * generic route — the same destination the previous string builder produced.
 */
export function projectPageScheduleRoute(projectName: string, pageTitle: string): ResolvedPathname {
    if (!projectName || !pageTitle) {
        return `/${encodeURIComponent(projectName)}/${encodeURIComponent(pageTitle)}/schedule` as ResolvedPathname;
    }
    return resolve("/[project]/[page]/schedule", {
        project: encodeURIComponent(projectName),
        page: encodeURIComponent(pageTitle),
    });
}
