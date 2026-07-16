import { getLogger } from "../lib/logger";
import { projectRoomPath } from "../lib/yjs/roomPath";
import { getRoomSyncState, onRoomSyncStateChange } from "../lib/yjs/roomSyncState";
import type { YjsClient } from "../yjs/YjsClient";
import { isProvisionalProject, store as globalStore } from "./store.svelte";

const logger = getLogger("yjsStore");

class YjsStore {
    private _client: YjsClient | undefined;
    // Record the Y.Doc GUID of the most recently set Project to prevent resetting with the same document
    private _lastProjectGuid: string | null = null;
    private _unsubSyncState: (() => void) | undefined;

    get yjsClient(): YjsClient | undefined {
        return this._client;
    }
    set yjsClient(v: YjsClient | undefined) {
        // Idempotency: avoid re-running assignments when the client hasn't changed
        if (v === this._client) return;
        // If only a new wrapper instance is given for the same underlying container, skip
        if (v && this._client && (v.containerId === this._client.containerId || v.clientId === this._client.clientId)) {
            return;
        }
        // Disable comment thread selection when switching documents and leave it to the default behavior
        try {
            Object.assign(globalStore, { openCommentItemId: null });
        } catch {}
        this._client = v;
        this.isConnected = !!(v?.isContainerConnected);

        try {
            this._unsubSyncState?.();
        } catch {}
        this._unsubSyncState = undefined;
        if (v?.containerId) {
            const room = projectRoomPath(v.containerId);
            const initialSyncState = getRoomSyncState(room);
            this.notYetSynced = initialSyncState !== "synced";
            if (
                initialSyncState === "too-large" || initialSyncState === "rate-limited" || initialSyncState === "denied"
            ) {
                this.syncError = initialSyncState;
            } else {
                this.syncError = null;
            }
            this._unsubSyncState = onRoomSyncStateChange(room, (state) => {
                this.notYetSynced = state !== "synced";
                if (state === "too-large" || state === "rate-limited" || state === "denied") {
                    this.syncError = state;
                } else {
                    this.syncError = null;
                }
            });
        } else {
            this.notYetSynced = false;
            this.syncError = null;
        }

        if (v) {
            const connectedProject = v.getProject();
            const newGuid: string | undefined = (connectedProject as unknown as { ydoc?: { guid?: string; }; })?.ydoc
                ?.guid;
            const existingGuid: string | undefined = (globalStore.project as unknown as { ydoc?: { guid?: string; }; })
                ?.ydoc?.guid;

            // If the currently connected project refers to the same Y.Doc (GUID), skip
            // However, if store.project is a provisional/empty project, we want to update
            // to ensure we have the real connected project with seeded data
            if (
                (existingGuid && newGuid && existingGuid === newGuid)
                && globalStore.project === (connectedProject as unknown as import("../schema/app-schema").Project)
            ) {
                // Still update to ensure reactivity is triggered
                globalStore.project = connectedProject as unknown as import("../schema/app-schema").Project;
                return;
            }
            // Furthermore, compare with the GUID set immediately before by self to improve idempotency
            if (this._lastProjectGuid && newGuid && this._lastProjectGuid === newGuid) {
                return;
            }

            // The provisional project created at startup (store.svelte.ts) is about to be replaced
            // by the real synced one. Anything typed into it lives in a different Y.Doc and is
            // discarded here, so at minimum make that loss visible instead of silent.
            const previousProject = globalStore.project;
            const connectedProjectAsAppSchema = connectedProject as unknown as import("../schema/app-schema").Project;
            if (
                previousProject && previousProject !== connectedProjectAsAppSchema
                && isProvisionalProject(previousProject)
            ) {
                const discardedPageCount = previousProject.items?.length ?? 0;
                if (discardedPageCount > 0) {
                    logger.warn(
                        `[yjsStore] Replacing provisional project with ${discardedPageCount} page(s) with the connected project (guid=${newGuid}). Edits made before the server connection was established are not preserved.`,
                    );
                }
            }

            globalStore.project = connectedProjectAsAppSchema;
            this._lastProjectGuid = newGuid ?? null;

            // Attach listeners to update isConnected state reactively
            if (v.wsProvider) {
                const updateConnected = () => {
                    this.isConnected = v.isContainerConnected;
                };
                v.wsProvider.on("status", updateConnected);
                v.wsProvider.on("synced", updateConnected);
                // Initial check
                updateConnected();
            }
        }
    }

    // Connection state is a plain data property for Svelte 5 reactivity
    isConnected: boolean = false;
    // True until the current room's initial sync completes, so the UI can indicate that
    // edits may still be applied to a stale/local-only copy of the document.
    notYetSynced: boolean = false;
    // Set when the server rejects sync with a fatal error
    syncError: "too-large" | "rate-limited" | "denied" | null = null;
    get connectionState() {
        return this._client?.getConnectionStateString() ?? "Disconnected";
    }
    get currentProjectId() {
        return this._client?.containerId ?? null;
    }

    reset() {
        this._client = undefined;
        this._lastProjectGuid = null;
        this.isConnected = false;
        this.notYetSynced = false;
        this.syncError = null;
        try {
            this._unsubSyncState?.();
        } catch {}
        this._unsubSyncState = undefined;
    }

    getIsConnected() {
        return this.isConnected;
    }
    getConnectionState() {
        return this.connectionState;
    }
    getCurrentProjectId() {
        return this.currentProjectId;
    }
}

export const yjsStore = $state(new YjsStore());
if (typeof window !== "undefined") {
    window.__YJS_STORE__ = yjsStore;
}
