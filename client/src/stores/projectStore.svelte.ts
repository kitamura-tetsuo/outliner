import { getLogger } from "../lib/logger";
import { listAccessibleProjects } from "../services/projectDirectoryService";
import { firestoreStore } from "./firestoreStore.svelte";

const logger = getLogger("ProjectStore");

export interface ProjectInfo {
    id: string;
    name: string;
    isDefault: boolean;
}

export class ProjectStore {
    projects = $state<Array<ProjectInfo>>([]);
    isLoaded = $state(false);

    async refresh(): Promise<void> {
        try {
            const defaultProjectId = firestoreStore.userProject?.defaultProjectId;
            this.projects = (await listAccessibleProjects()).map(project => ({
                id: project.projectId,
                name: project.title,
                isDefault: project.projectId === defaultProjectId,
            }));
        } finally {
            this.isLoaded = true;
            if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("project-store-updated"));
        }
    }

    async syncFromFirestore(): Promise<void> {
        await this.refresh();
    }

    reset(): void {
        this.projects = [];
        this.isLoaded = false;
    }

    syncDefaultPreference(): void {
        const defaultProjectId = firestoreStore.userProject?.defaultProjectId;
        this.projects = this.projects.map(project => ({
            ...project,
            isDefault: project.id === defaultProjectId,
        }));
    }
}

export const projectStore = $state(new ProjectStore());

if (typeof window !== "undefined") {
    const isTestEnvironment = import.meta.env.MODE === "test"
        || import.meta.env.VITE_IS_TEST === "true"
        || window.localStorage?.getItem?.("VITE_IS_TEST") === "true"
        || (window as Window & typeof globalThis & { __E2E__?: boolean; }).__E2E__ === true;
    if (isTestEnvironment) {
        (window as Window & typeof globalThis & { __PROJECT_STORE__?: typeof projectStore; }).__PROJECT_STORE__ =
            projectStore;
    }
    window.addEventListener("user-project-preferences-updated", () => projectStore.syncDefaultPreference());
    void import("../auth/UserManager").then(({ userManager }) => {
        userManager.addEventListener(result => {
            if (result) void projectStore.refresh().catch(error => logger.warn("Project list refresh failed", error));
            else projectStore.reset();
        });
        if (userManager.getCurrentUser()) {
            void projectStore.refresh().catch(error => logger.warn("Project list refresh failed", error));
        }
    });
}
