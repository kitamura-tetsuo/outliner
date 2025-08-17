// @ts-nocheck
import { FluidClient } from "../fluid/fluidClient";
import { store } from "./store.svelte";

class GeneralStore {
    // FluidClientのインスタンスを保持するStore
    private _fluidClient = $state<FluidClient>();
    public get fluidClient(): FluidClient | undefined {
        return this._fluidClient;
    }
    public set fluidClient(v: FluidClient | undefined) {
        console.log(`fluidStore: Setting fluidClient`, { exists: !!v, containerId: v?.containerId });
        this._fluidClient = v;
        if (v) {
            const project = v.getProject();
            console.log(`fluidStore: Got project from client`, {
                projectExists: !!project,
                projectTitle: project?.title,
            });
            store.project = project;
            console.log(`fluidStore: Set store.project`, { storeProjectExists: !!store.project });
        }
    }

    // 初期化中フラグを追跡するための変数
    isInitializing = $state(false);

    // 派生値
    isConnected = $derived(this._fluidClient?.isContainerConnected ?? false);
    connectionState = $derived(this._fluidClient?.getConnectionStateString() ?? "未接続");
    currentContainerId = $derived(this._fluidClient?.containerId ?? null);
    currentUser = $derived(this._fluidClient?.currentUser ?? null);

    // 派生値を取得する関数
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
export const fluidStore = new GeneralStore();

if (process.env.NODE_ENV === "test") {
    if (typeof window !== "undefined") {
        (window as any).__FLUID_STORE__ = fluidStore;
    }
}
