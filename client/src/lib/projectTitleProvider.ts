// Neutral title provider used by unit tests to avoid direct Fluid references.
// In application runtime, it delegates to the existing implementation.

// Lazy import to keep callers decoupled from the underlying module name.
export function getProjectTitle(containerId: string): string {
    try {
        // Defer to existing implementation without exposing it in test code.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require("./fluidService.svelte");
        return typeof mod.getProjectTitle === "function" ? mod.getProjectTitle(containerId) : "";
    } catch (_e) {
        // Fallback for tests or when the fluid module isn’t available.
        return "";
    }
}
