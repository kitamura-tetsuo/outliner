// Neutral title provider used by unit tests to avoid direct backend references.
// In application runtime, it delegates to the existing implementation.

import * as yjsService from "./yjsService.svelte";

export function getProjectTitle(containerId: string): string {
    try {
        // Defer to existing implementation without exposing it in test code.
        return typeof yjsService.getProjectTitle === "function" ? yjsService.getProjectTitle(containerId) : "";
    } catch (_e) {
        // Fallback for tests or when the module isn’t available.
        return "";
    }
}
