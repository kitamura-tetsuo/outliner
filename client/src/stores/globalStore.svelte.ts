import type { Project } from "../schema/app-schema";
import { containerStore } from "./containerStore.svelte";
import { firestoreStore } from "./firestoreStore.svelte";
import { fluidStore } from "./fluidStore.svelte";
import { store as appStore } from "./store.svelte";

/**
 * Global store proxy that exposes a unified interface while
 * delegating to backend specific stores internally.
 */
class GlobalStoreProxy {
    // fluid page store
    get pages() {
        return appStore.pages;
    }
    get currentPage() {
        return appStore.currentPage;
    }
    get project(): Project | undefined {
        return appStore.project;
    }
    set project(p: Project) {
        appStore.project = p;
    }

    // fluid connection store
    get fluidClient() {
        return fluidStore.fluidClient;
    }
    set fluidClient(v) {
        fluidStore.fluidClient = v;
    }
    get isConnected() {
        return fluidStore.isConnected;
    }
    get connectionState() {
        return fluidStore.connectionState;
    }
    get currentContainerId() {
        return fluidStore.currentContainerId;
    }
    get currentUser() {
        return fluidStore.currentUser;
    }

    // firestore store
    get userContainer() {
        return firestoreStore.userContainer;
    }
    set userContainer(v) {
        firestoreStore.userContainer = v;
    }

    // container store
    get containers() {
        return containerStore.containers;
    }
}

export const store = new GlobalStoreProxy();

if (process.env.NODE_ENV === "test" && typeof window !== "undefined") {
    (window as any).__GLOBAL_STORE__ = store;
}
