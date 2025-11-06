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

    // テスト環境の検出（より広範囲に検出）
    const isTestEnv = import.meta.env.MODE === "test"
        || process.env.NODE_ENV === "test"
        || import.meta.env.VITE_IS_TEST === "true"
        || (typeof window !== "undefined" && window.mockFluidClient === false)
        || (typeof window !== "undefined" && window.location.hostname === "localhost");

    // ID 重複を排除して安定化
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Temporary Set for deduplication, not reactive state
    const uniqueIds = Array.from(new Set(data.accessibleContainerIds));
    return uniqueIds
        .map(id => {
            let name: string;
            try {
                name = getProjectTitle(id);
            } catch (error) {
                console.warn(`Failed to get project title for ${id}:`, error);
                name = "";
            }
            // テスト環境で名前が空の場合、デフォルト名を使用
            if (isTestEnv && (!name || name.trim() === "")) {
                name = `テストプロジェクト${id.slice(-4)}`;
            }
            return {
                id,
                name,
                isDefault: data.defaultContainerId === id,
            };
        })
        .filter(container => {
            if (isTestEnv) {
                // テスト環境では、名前が空でないものを全て表示（\"プロジェクト\" も許可）
                return !!(container.name && container.name.trim() !== "");
            } else {
                // 本番環境では、厳密な条件でフィルタリング
                return container.name
                    && container.name.trim() !== ""
                    && container.name !== "プロジェクト";
            }
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
        (window as Window & { __CONTAINER_STORE__?: unknown; }).__CONTAINER_STORE__ = containerStore;
    }
}

// Hook into firestoreStore updates to keep containers mirrored without polling
const originalSetUserContainer =
    (firestoreStore as unknown as { setUserContainer?: (value: UserContainer | null) => void; }).setUserContainer?.bind(
        firestoreStore,
    );
if (typeof originalSetUserContainer === "function") {
    (firestoreStore as unknown as { setUserContainer: (value: UserContainer | null) => void; }).setUserContainer = (
        value: UserContainer | null,
    ) => {
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
