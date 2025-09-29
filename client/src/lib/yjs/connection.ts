import { IndexeddbPersistence } from "y-indexeddb";
import type { Awareness } from "y-protocols/awareness";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import { userManager } from "../../auth/UserManager";
import { pageRoomPath, projectRoomPath } from "./roomPath";
import { yjsService } from "./service";
import { attachTokenRefresh } from "./tokenRefresh";

export type PageConnection = {
    doc: Y.Doc;
    provider: WebsocketProvider;
    awareness: Awareness;
    dispose: () => void;
};

export type ProjectConnection = {
    doc: Y.Doc;
    provider: WebsocketProvider;
    awareness: Awareness;
    getPageConnection: (pageId: string) => PageConnection | undefined;
    dispose: () => void;
};

function getWsBase(): string {
    const url = import.meta.env.VITE_YJS_WS_URL || `ws://localhost:${import.meta.env.VITE_YJS_PORT || 7093}`;
    return url as string;
}

function isWsEnabled(): boolean {
    try {
        // Test override to forcibly enable WS even if env disables it
        const override = typeof window !== "undefined"
            && window.localStorage?.getItem?.("VITE_YJS_ENABLE_WS") === "true";
        if (override) return true;
        const envDisabled = String(import.meta.env.VITE_YJS_DISABLE_WS || "") === "true";
        const lsDisabled = typeof window !== "undefined"
            && window.localStorage?.getItem?.("VITE_YJS_DISABLE_WS") === "true";
        return !(envDisabled || lsDisabled);
    } catch {
        return true;
    }
}

async function getFreshIdToken(): Promise<string> {
    // Wait for auth and fetch a fresh ID token
    const auth = userManager.auth;
    const isTestEnv = import.meta.env.MODE === "test" || process.env.NODE_ENV === "test";
    if (!auth.currentUser) {
        if (isTestEnv) {
            return "";
        }
        // Try short wait using a simple promise
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    if (!auth.currentUser) {
        if (isTestEnv) {
            return "";
        }
        // As a fallback, wait briefly to allow auth flow to start
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    const token = await auth.currentUser?.getIdToken(true);
    if (!token) {
        // In test/integration environments, allow proceeding without a token
        if (isTestEnv) {
            return "";
        }
        throw new Error("No Firebase ID token available");
    }
    return token;
}

export async function connectPageDoc(doc: Y.Doc, projectId: string, pageId: string): Promise<PageConnection> {
    const wsBase = getWsBase();
    const room = pageRoomPath(projectId, pageId);
    if (typeof indexedDB !== "undefined") {
        try {
            new IndexeddbPersistence(room, doc);
        } catch { /* no-op in Node */ }
    }
    let token = "";
    try {
        token = await getFreshIdToken();
    } catch {
        // Tolerate missing token in tests; server will reject unauthenticated connections,
        // but local-only mode may still function for offline scenarios.
        token = "";
    }
    const provider = new WebsocketProvider(wsBase, room, doc, {
        params: token ? { auth: token } : undefined,
        connect: isWsEnabled(),
    });
    const awareness = provider.awareness;
    const current = userManager.getCurrentUser();
    if (current) {
        awareness.setLocalStateField("user", {
            userId: current.id,
            name: current.name,
            color: undefined,
        });
    }
    const unbind = yjsService.bindPagePresence(awareness);
    const unsub = attachTokenRefresh(provider);
    const dispose = () => {
        try {
            unbind();
        } catch {}
        try {
            unsub();
        } catch {}
        try {
            provider.destroy();
        } catch {}
    };
    return { doc, provider, awareness, dispose };
}

export async function createProjectConnection(projectId: string): Promise<ProjectConnection> {
    const doc = new Y.Doc({ guid: projectId });
    const wsBase = getWsBase();
    const room = projectRoomPath(projectId);

    // Local persistence keyed by room path
    if (typeof indexedDB !== "undefined") {
        try {
            new IndexeddbPersistence(room, doc);
        } catch { /* no-op in Node */ }
    }

    let token = "";
    try {
        token = await getFreshIdToken();
    } catch {
        // Tolerate missing token; provider will attempt reconnect later
        token = "";
    }
    const provider = new WebsocketProvider(wsBase, room, doc, {
        params: token ? { auth: token } : undefined,
        connect: isWsEnabled(),
    });

    // Awareness (presence)
    const awareness = provider.awareness;
    const current = userManager.getCurrentUser();
    if (current) {
        awareness.setLocalStateField("user", {
            userId: current.id,
            name: current.name,
            color: undefined,
        });
    }
    const unbind = yjsService.bindProjectPresence(awareness);

    // Refresh auth param on token refresh
    const unsub = attachTokenRefresh(provider);

    const pages = new Map<string, PageConnection>();

    doc.on("subdocs", (evt: any) => {
        evt.added.forEach((s: Y.Doc) => {
            void connectPageDoc(s, projectId, s.guid).then(c => pages.set(s.guid, c));
        });
        evt.removed.forEach((s: Y.Doc) => {
            const c = pages.get(s.guid);
            c?.dispose();
            pages.delete(s.guid);
        });
    });

    // Fallback: also observe direct changes to the pages map (helps in test env)
    try {
        const pagesMap = doc.getMap<Y.Doc>("pages");
        pagesMap.observe((e: any) => {
            for (const key of e.keysChanged as Set<string>) {
                const sub = pagesMap.get(key);
                if (sub && !pages.has(key)) {
                    // Best-effort, non-blocking connection setup
                    void connectPageDoc(sub as unknown as Y.Doc, projectId, key).then(c => pages.set(key, c));
                }
                if (!sub && pages.has(key)) {
                    const c = pages.get(key);
                    c?.dispose();
                    pages.delete(key);
                }
            }
        });
    } catch {}

    const dispose = () => {
        try {
            unbind();
        } catch {}
        try {
            unsub();
        } catch {}
        try {
            provider.destroy();
        } catch {}
        pages.forEach(p => {
            try {
                p.dispose();
            } catch {}
        });
        try {
            doc.destroy();
        } catch {}
    };

    return { doc, provider, awareness, getPageConnection: id => pages.get(id), dispose };
}

export async function connectProjectDoc(doc: Y.Doc, projectId: string): Promise<{
    provider: WebsocketProvider;
    awareness: Awareness;
}> {
    const wsBase = getWsBase();
    const room = projectRoomPath(projectId);
    if (typeof indexedDB !== "undefined") {
        try {
            new IndexeddbPersistence(room, doc);
        } catch { /* no-op in Node */ }
    }
    let token = "";
    if (!(import.meta.env.MODE === "test" || process.env.NODE_ENV === "test")) {
        try {
            token = await getFreshIdToken();
        } catch {
            // Stay offline if auth is not ready; provider will attempt reconnect later.
        }
    }
    const provider = new WebsocketProvider(wsBase, room, doc, {
        params: token ? { auth: token } : undefined,
        connect: isWsEnabled(),
    });
    const awareness = provider.awareness;
    const current = userManager.getCurrentUser();
    if (current) {
        awareness.setLocalStateField("user", {
            userId: current.id,
            name: current.name,
            color: undefined,
        });
    }
    // Refresh auth param on token refresh
    attachTokenRefresh(provider);
    return { provider, awareness };
}
