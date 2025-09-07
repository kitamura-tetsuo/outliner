import type { Project } from "../schema/app-schema";
import { containerStore } from "./containerStore.svelte";
import { firestoreStore } from "./firestoreStore.svelte";
// Switch backend connection store to Yjs
import { store as appStore } from "./store.svelte";
import { yjsStore } from "./yjsStore.svelte";

/**
 * Global store proxy that exposes a unified interface while
 * delegating to backend specific stores internally.
 */
class GlobalStoreProxy {
    // page store
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

    // yjs connection store
    get yjsClient() {
        return yjsStore.yjsClient;
    }
    set yjsClient(v) {
        yjsStore.yjsClient = v;
    }
    get isConnected() {
        return yjsStore.isConnected as any;
    }
    get connectionState() {
        return yjsStore.connectionState as any;
    }
    get currentContainerId() {
        return yjsStore.currentContainerId as any;
    }
    get currentUser() {
        return yjsStore.currentUser as any;
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
