import { resolve as kitResolve } from "$app/paths";

/**
 * Strongly-typed wrapper around SvelteKit's resolve function to bypass
 * 'Expected 2 arguments, but got 1' errors with dynamic paths.
 */
export function resolvePath(path: string): string {
    return kitResolve(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        path as any as Parameters<typeof kitResolve>[0],
        undefined as unknown as Parameters<typeof kitResolve>[1],
    );
}
