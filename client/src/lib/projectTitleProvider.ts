// Neutral title provider used by unit tests to avoid direct backend references.
// In application runtime, it delegates to the existing implementation.

// Lazy import to keep callers decoupled from the underlying module name.
export function getProjectTitle(containerId: string): string {
    try {
        // Defer to existing implementation without exposing it in test code.

        const mod = require("./yjsService.svelte");
        return typeof mod.getProjectTitle === "function" ? mod.getProjectTitle(containerId) : "";
    } catch (_) {
        // Fallback for tests or when the module isn’t available.
        return "";
    }
}
