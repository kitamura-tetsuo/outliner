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
