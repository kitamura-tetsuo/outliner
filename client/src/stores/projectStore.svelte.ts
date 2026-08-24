import { getLogger } from "../lib/logger";
import { listAccessibleProjects } from "../services/projectDirectoryService";

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
            this.projects = (await listAccessibleProjects()).map(project => ({
                id: project.projectId,
                name: project.title,
                isDefault: false,
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
}

export const projectStore = $state(new ProjectStore());

if (typeof window !== "undefined") {
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
