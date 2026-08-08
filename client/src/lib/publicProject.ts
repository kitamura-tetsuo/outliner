import { DEMO_PROJECT_NAME } from "./demoSeed";

/**
 * Public projects are readable by anonymous visitors. Today the public `/demo`
 * project is the only one, but the standalone table, schedule and calendar
 * routes all need the same predicate, so it lives here rather than being
 * re-derived from `DEMO_PROJECT_NAME` in every route.
 */
export function isPublicProject(projectName: string | undefined): boolean {
    return projectName === DEMO_PROJECT_NAME;
}
