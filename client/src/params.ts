import { defineParams } from "@sveltejs/kit/params";
// `vite build` also imports this module with plain Node (to validate the
// matchers), where Vite aliases such as `$shared` do not resolve: keep its
// imports relative with explicit extensions.
import { isDemoProjectSlug } from "../../shared/src/demoProjects.ts";

/**
 * Route parameter matchers (SvelteKit 3 reads them from this single module).
 *
 * `demoProject` matches the public demo projects, one per locale (`demo`,
 * `demo-ja`, …). The demo routes are a single tree parameterized by this
 * matcher rather than a copy per locale. Because the matcher only accepts
 * registered slugs, every other first path segment still falls through to the
 * generic `[project]` routes, and `/demo` keeps emitting byte-identical URLs.
 */
export const params = defineParams({
    demoProject: (param: string) => isDemoProjectSlug(param) ? param : undefined,
});
