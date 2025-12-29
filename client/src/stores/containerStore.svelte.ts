/**
 * Backward compatibility alias for containerStore -> projectStore migration
 * This file re-exports projectStore types and the store itself with the old naming
 */
import { type ProjectInfo, projectsFromUserProject, ProjectStore, projectStore } from "./projectStore.svelte";

// Re-export with old names for backward compatibility
export type ContainerInfo = ProjectInfo;
export type { ProjectInfo };

export const containerStore = {
    get containers() {
        return projectStore.projects;
    },
    syncFromFirestore(): void {
        projectStore.syncFromFirestore();
    },
    reset(): void {
        projectStore.reset();
    },
};

// Re-export for any code that might import directly
export { projectsFromUserProject, ProjectStore, projectStore };

// Also export containersFromUserContainer as an alias
export const containersFromUserContainer = projectsFromUserProject;

// Expose containerStore globally for E2E test access
if (typeof window !== "undefined") {
    const isTestEnv = import.meta.env.MODE === "test"
        || process.env.NODE_ENV === "test"
        || import.meta.env.VITE_IS_TEST === "true"
        || window.location.hostname === "localhost"
        || window.localStorage?.getItem?.("VITE_IS_TEST") === "true"
        || (window as any).__E2E__ === true;
    if (isTestEnv) {
        (window as any).__CONTAINER_STORE__ = containerStore;
    }
}
