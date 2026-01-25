import type { YjsClient } from "../yjs/YjsClient";
import { store as globalStore } from "./store.svelte";

class YjsStore {
    private _client: YjsClient | undefined;
    // Record the Y.Doc GUID of the most recently set Project to prevent resetting with the same document
    private _lastProjectGuid: string | null = null;

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
            (globalStore as any).openCommentItemId = null;
        } catch {}
        this._client = v;
        this.isConnected = !!(v?.isContainerConnected);
        if (v) {
            const connectedProject = v.getProject();
            const newGuid: string | undefined = (connectedProject as any)?.ydoc?.guid;
            const existingGuid: string | undefined = (globalStore.project as any)?.ydoc?.guid;

            // If the currently connected project refers to the same Y.Doc (GUID), skip
            // However, if store.project is a provisional/empty project, we want to update
            // to ensure we have the real connected project with seeded data
            if (
                (existingGuid && newGuid && existingGuid === newGuid)
                && globalStore.project === (connectedProject as any)
            ) {
                // Still update to ensure reactivity is triggered
                globalStore.project = connectedProject as any;
                return;
            }
            // Furthermore, compare with the GUID set immediately before by self to improve idempotency
            if (this._lastProjectGuid && newGuid && this._lastProjectGuid === newGuid) {
                return;
            }

            globalStore.project = connectedProject as any;
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
            // In headless E2E runs, pages can be created on a provisional project
            // before the live Yjs project is connected. When the connection arrives,
            // the store switches to the connected project, which would otherwise
            // appear empty. To keep test flows stable, merge page titles from the
            // previous project into the newly connected one if the latter has none.
            try {
                /*
                if (isTestEnv && prevCount > 0) {
                    // Case A: Connected project is empty -> Port the entire previous page (maintain ID)
                    if (newCount === 0) {
                        for (let i = 0; i < prevCount; i++) {
                            const prevPage: any = prevItems.at ? prevItems.at(i) : prevItems[i];
                            const title = prevPage?.text?.toString?.() ?? String(prevPage?.text ?? "");
                            if (!title) continue;
                            const cp: any = connectedProject as any;
                            try {
                                const newPage: any = (typeof cp.addPage === "function")
                                    ? cp.addPage(title, "tester")
                                    : (cp.items?.addNode ? cp.items.addNode("tester") : null);
                                if (!newPage) continue;
                                // Inherit page ID
                                try {
                                    (newPage as any).value?.set?.("id", String(prevPage.id));
                                } catch {}
                                try {
                                    newPage.updateText?.(title);
                                } catch {}
                                // Inherit ID/text for child rows as well
                                try {
                                    const prevLines: any = prevPage?.items as any;
                                    const len = prevLines?.length ?? 0;
                                    for (let j = 0; j < len; j++) {
                                        const prevLine: any = prevLines.at ? prevLines.at(j) : prevLines[j];
                                        if (!prevLine) continue;
                                        const txt = prevLine.text?.toString?.() ?? String(prevLine.text ?? "");
                                        const newLine: any = newPage.items?.addNode
                                            ? newPage.items.addNode("tester")
                                            : null;
                                        if (!newLine) continue;
                                        try {
                                            (newLine as any).value?.set?.("id", String(prevLine.id));
                                        } catch {}
                                        try {
                                            newLine.updateText?.(txt);
                                        } catch {}
                                    }
                                } catch {}
                            } catch {}
                        }
                    } else {
                        // Case B: Existing page in connected project -> Overwrite ID with matching title (overwrite row with matching index as well)
                        try {
                            const newPages: any = newItems;
                            const getTitle = (p: any) => p?.text?.toString?.() ?? String(p?.text ?? "");
                            const newLen = newPages?.length ?? 0;
                            for (let i = 0; i < newLen; i++) {
                                const curPage: any = newPages.at ? newPages.at(i) : newPages[i];
                                if (!curPage) continue;
                                const title = getTitle(curPage);
                                // Search for a page with the same name from the previous project
                                let matchPrev: any = null;
                                for (let k = 0; k < prevCount; k++) {
                                    const pp = prevItems.at ? prevItems.at(k) : prevItems[k];
                                    if (getTitle(pp) === title) {
                                        matchPrev = pp;
                                        break;
                                    }
                                }
                                if (!matchPrev) continue;
                                // Overwrite page ID
                                try {
                                    (curPage as any).value?.set?.("id", String(matchPrev.id));
                                } catch {}
                                // Overwrite ID of child rows with corresponding index
                                try {
                                    const prevLines: any = matchPrev?.items as any;
                                    const newLines: any = curPage?.items as any;
                                    const len = Math.min(prevLines?.length ?? 0, newLines?.length ?? 0);
                                    for (let j = 0; j < len; j++) {
                                        const prevLine: any = prevLines.at ? prevLines.at(j) : prevLines[j];
                                        const curLine: any = newLines.at ? newLines.at(j) : newLines[j];
                                        if (!prevLine || !curLine) continue;
                                        try {
                                            (curLine as any).value?.set?.("id", String(prevLine.id));
                                        } catch {}
                                    }
                                } catch {}
                            }
                        } catch {}
                    }
                }
                */
            } catch {
                // best-effort merge only; ignore failures in non-test environments
            }
        }
    }

    // Connection state is a plain data property for Svelte 5 reactivity
    isConnected: boolean = false;
    get connectionState() {
        return this._client?.getConnectionStateString() ?? "Disconnected";
    }
    get currentProjectId() {
        return this._client?.containerId ?? null;
    }
    get currentUser() {
        return null;
    }

    reset() {
        this._client = undefined;
        this._lastProjectGuid = null;
        this.isConnected = false;
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
    getCurrentUser() {
        return this.currentUser;
    }
}

export const yjsStore = $state(new YjsStore());
if (typeof window !== "undefined") {
    (window as any).__YJS_STORE__ = yjsStore;
}
