// Neutral title provider used by unit tests to avoid direct backend references.
// In application runtime, it delegates to the existing implementation.

import { getContainerTitleFromMetaDoc } from "./metaDoc.svelte";
import * as yjsService from "./yjsService.svelte";

export function getProjectTitle(containerId: string): string {
    try {
        // Defer to existing implementation without exposing it in test code.
        if (typeof yjsService.getProjectTitle === "function") {
            return yjsService.getProjectTitle(containerId);
        }
        // Fallback: try metaDoc directly
        return getContainerTitleFromMetaDoc(containerId);
    } catch {
        // Final fallback for tests or when the module isn't available.
        return "";
    }
}
