import { containerTitleCache } from "../lib/containerTitleCache";
import { getProjectTitle } from "../lib/projectTitleProvider";
import { firestoreStore, type UserContainer } from "./firestoreStore.svelte";

export interface ContainerInfo {
    id: string;
    name: string;
    isDefault: boolean;
}

export function containersFromUserContainer(
    data: UserContainer | null,
    _ucVersion?: number,
): Array<ContainerInfo> {
    void _ucVersion; // reactivity anchor: ensures callers can pass ucVersion without unused warnings
    if (!data || !data.accessibleContainerIds) {
        return [];
    }

    // ID 重複を排除して安定化
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Temporary Set for deduplication, not reactive state
    const uniqueIds = Array.from(new Set(data.accessibleContainerIds));
    return uniqueIds
        .map(id => {
            let name: string;

            // Try to get title from multiple sources in order of preference:
            // 1. Client-side cache (persisted across reloads)
            // 2. Live Yjs registry (current session)
            // 3. Fallback to container ID

            // First try cached title
            const cachedTitle = containerTitleCache.getTitle(id);
            if (cachedTitle) {
                name = cachedTitle;
            } else {
                // Try live registry
                try {
                    name = getProjectTitle(id);
                } catch (error) {
                    console.warn(`Failed to get project title for ${id}:`, error);
                    name = "";
                }

                // If we got a title from registry, cache it for future use
                if (name && name.trim() && name !== "プロジェクト") {
                    containerTitleCache.setTitle(id, name);
                }
            }

            // Fallback logic: always use container ID when no meaningful title is available
            if (!name || name.trim() === "" || name === "プロジェクト") {
                name = id;
            }

            return {
                id,
                name,
                isDefault: data.defaultContainerId === id,
            };
        })
        .filter(container => {
            // Always include containers that have valid names or IDs
            // Since we now use container ID as fallback, we should never filter out valid containers
            return !!(container.name && container.name.trim() !== "");
        });
}

export class ContainerStore {
    containers: Array<ContainerInfo> = [];

    constructor() {
        this.syncFromFirestore();
    }

    syncFromFirestore(): void {
        const version = firestoreStore.ucVersion;
        this.containers = containersFromUserContainer(firestoreStore.userContainer, version);
        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("container-store-updated"));
        }
    }

    // tests & isolation
    reset() {
        this.containers = [];
    }
}

export const containerStore = $state(new ContainerStore());

if (typeof window !== "undefined") {
    const isTestEnv = import.meta.env.MODE === "test"
        || process.env.NODE_ENV === "test"
        || import.meta.env.VITE_IS_TEST === "true"
        || window.location.hostname === "localhost";
    if (isTestEnv) {
        (window as any).__CONTAINER_STORE__ = containerStore;
    }
}

// Hook into firestoreStore updates to keep containers mirrored without polling
const originalSetUserContainer = (firestoreStore as any).setUserContainer?.bind(firestoreStore);
if (typeof originalSetUserContainer === "function") {
    (firestoreStore as any).setUserContainer = (value: UserContainer | null) => {
        originalSetUserContainer(value);
        try {
            containerStore.syncFromFirestore();
        } catch (error) {
            console.warn("containerStore.syncFromFirestore failed", error);
        }
    };
    // Ensure the initial mirror uses the latest data when this module loads after setUserContainer was patched
    queueMicrotask(() => {
        try {
            containerStore.syncFromFirestore();
        } catch {}
    });
}
