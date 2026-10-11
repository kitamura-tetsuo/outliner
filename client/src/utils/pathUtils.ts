import { resolve as kitResolve } from "$app/paths";

/**
 * Wrapper around SvelteKit's resolve function for dynamic (already
 * parameter-populated) paths, which its route-ID-typed signature cannot express.
 */
export function resolvePath(path: string): string {
    return (kitResolve as (path: string, params: undefined) => string)(path, undefined);
}
