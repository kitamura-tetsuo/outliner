import type { YjsClient } from "../yjs/YjsClient";
import { store as globalStore } from "./store.svelte";

class YjsStore {
    private _client = $state<YjsClient>();

    get yjsClient(): YjsClient | undefined {
        return this._client;
    }
    set yjsClient(v: YjsClient | undefined) {
        this._client = v;
        if (v) {
            const project = v.getProject();
            globalStore.project = project as any;
        }
    }

    // Derived values
    isConnected = $derived(this._client?.isContainerConnected ?? false);
    connectionState = $derived(this._client?.getConnectionStateString() ?? "未接続");
    currentContainerId = $derived(this._client?.containerId ?? null);
    currentUser = $derived(null);

    getIsConnected() {
        return this.isConnected;
    }
    getConnectionState() {
        return this.connectionState;
    }
    getCurrentContainerId() {
        return this.currentContainerId;
    }
    getCurrentUser() {
        return this.currentUser;
    }
}

export const yjsStore = new YjsStore();
if (typeof window !== "undefined") {
    (window as any).__YJS_STORE__ = yjsStore;
}
