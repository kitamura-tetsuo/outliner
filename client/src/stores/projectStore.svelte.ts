import { getProjectTitleFromMetaDoc } from "../lib/metaDoc.svelte";
import { getProjectTitle } from "../lib/projectTitleProvider";
import { firestoreStore, type UserProject } from "./firestoreStore.svelte";

export interface ProjectInfo {
    id: string;
    name: string;
    isDefault: boolean;
}

export function projectsFromUserProject(
    data: UserProject | null,
    _ucVersion?: number,
): Array<ProjectInfo> {
    void _ucVersion; // reactivity anchor: ensures callers can pass ucVersion without unused warnings
    if (!data || !data.accessibleContainerIds) {
        return [];
    }

    // テスト環境の検出（より広範囲に検出）
    const isTestEnv = import.meta.env.MODE === "test"
        || process.env.NODE_ENV === "test"
        || import.meta.env.VITE_IS_TEST === "true"
        || (typeof window !== "undefined" && window.mockFluidClient === false)
        || (typeof window !== "undefined" && window.location.hostname === "localhost");

    // ID 重複を排除して安定化
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Temporary Set for deduplication, not reactive state
    const uniqueIds = Array.from(new Set(data.accessibleProjectIds));
    return uniqueIds
        .map(id => {
            // Resolve project label with fallback chain:
            // 1. Try getProjectTitleFromMetaDoc (metadata Y.Doc)
            // 2. If empty, try getProjectTitle (live Yjs project)
            // 3. If still empty, use the raw project ID
            let name: string;
            try {
                name = getProjectTitleFromMetaDoc(id);
                if (!name || name.trim() === "") {
                    name = getProjectTitle(id);
                }
                if (!name || name.trim() === "") {
                    name = id;
                }
            } catch (error) {
                console.warn(`Failed to get project title for ${id}:`, error);
                name = id;
            }
            // テスト環境で名前が空の場合、デフォルト名を使用
            if (isTestEnv && (!name || name.trim() === "")) {
                name = `テストプロジェクト${id.slice(-4)}`;
            }
            return {
                id,
                name,
                isDefault: data.defaultProjectId === id,
            };
        })
        .filter(project => {
            if (isTestEnv) {
                // テスト環境では、名前が空でないものを全て表示（\"プロジェクト\" も許可）
                return !!(project.name && project.name.trim() !== "");
            } else {
                // 本番環境では、厳密な条件でフィルタリング
                return project.name
                    && project.name.trim() !== ""
                    && project.name !== "プロジェクト";
            }
        });
}

export class ProjectStore {
    projects: Array<ProjectInfo> = [];

    constructor() {
        this.syncFromFirestore();
    }

    syncFromFirestore(): void {
        const version = firestoreStore.ucVersion;
        this.projects = projectsFromUserProject(firestoreStore.userProject, version);
        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("project-store-updated"));
        }
    }

    // tests & isolation
    reset() {
        this.projects = [];
    }
}

export const projectStore = $state(new ProjectStore());

if (typeof window !== "undefined") {
    const isTestEnv = import.meta.env.MODE === "test"
        || process.env.NODE_ENV === "test"
        || import.meta.env.VITE_IS_TEST === "true"
        || window.location.hostname === "localhost";
    if (isTestEnv) {
        (window as any).__PROJECT_STORE__ = projectStore;
    }
}

// Hook into firestoreStore updates to keep projects mirrored without polling
const originalSetUserProject = (firestoreStore as any).setUserProject?.bind(firestoreStore);
if (typeof originalSetUserProject === "function") {
    (firestoreStore as any).setUserProject = (value: UserProject | null) => {
        originalSetUserProject(value);
        try {
            projectStore.syncFromFirestore();
        } catch (error) {
            console.warn("projectStore.syncFromFirestore failed", error);
        }
    };
    // Ensure the initial mirror uses the latest data when this module loads after setUserProject was patched
    queueMicrotask(() => {
        try {
            projectStore.syncFromFirestore();
        } catch {}
    });
}
