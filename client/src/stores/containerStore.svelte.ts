import { getProjectTitle } from "../lib/fluidService.svelte";
import { firestoreStore } from "./firestoreStore.svelte";

export interface ContainerInfo {
    id: string;
    name: string;
    isDefault: boolean;
}

export class ContainerStore {
    containers = $derived.by<Array<ContainerInfo>>(() => {
        const data = firestoreStore.userContainer;
        if (!data || !data.accessibleContainerIds) {
            return [];
        }
        return data.accessibleContainerIds
            .map(id => ({
                id,
                name: getProjectTitle(id),
                isDefault: data.defaultContainerId === id,
            }))
            .filter(container =>
                container.name
                && container.name.trim() !== ""
                && container.name !== "プロジェクト"
            );
    });
}

export const containerStore = new ContainerStore();

if (process.env.NODE_ENV === "test" && typeof window !== "undefined") {
    (window as any).__CONTAINER_STORE__ = containerStore;
}
