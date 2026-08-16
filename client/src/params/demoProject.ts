import { isDemoProjectSlug } from "$shared/demoProjects";
import type { ParamMatcher } from "@sveltejs/kit";

/**
 * Matches the public demo projects, one per locale (`demo`, `demo-ja`, …).
 *
 * The demo routes are a single tree parameterized by this matcher rather than a
 * copy per locale. Because the matcher only accepts registered slugs, every
 * other first path segment still falls through to the generic `[project]`
 * routes, and `/demo` keeps emitting byte-identical URLs.
 */
export const match: ParamMatcher = (param) => isDemoProjectSlug(param);
