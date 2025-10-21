import { IndexeddbPersistence } from "y-indexeddb";
import type { Awareness } from "y-protocols/awareness";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import { userManager } from "../../auth/UserManager";
import { pageRoomPath, projectRoomPath } from "./roomPath";
import { yjsService } from "./service";
import { attachTokenRefresh } from "./tokenRefresh";

function isIndexedDBEnabled(): boolean {
    try {
        const lsDisabled = typeof window !== "undefined"
            && window.localStorage?.getItem?.("VITE_DISABLE_YJS_INDEXEDDB") === "true";
        return !lsDisabled;
    } catch {
        return true;
    }
}

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
        // テスト環境ではデフォルトでWebSocketを有効にする
        const isTestEnv = import.meta.env.MODE === "test"
            || (import.meta.env as any).VITE_IS_TEST === "true"
            || (typeof window !== "undefined" && window.localStorage?.getItem?.("VITE_IS_TEST") === "true");
        if (isTestEnv && !envDisabled && !lsDisabled) return true;
        return !(envDisabled || lsDisabled);
    } catch {
        return true;
    }
}

function isAuthRequired(): boolean {
    try {
        const envReq = String((import.meta.env as any).VITE_YJS_REQUIRE_AUTH || "") === "true";
        const lsReq = typeof window !== "undefined"
            && window.localStorage?.getItem?.("VITE_YJS_REQUIRE_AUTH") === "true";
        return envReq || lsReq;
    } catch {
        return false;
    }
}

async function getFreshIdToken(): Promise<string> {
    // Wait for auth and fetch a fresh ID token
    const auth = userManager.auth;
    const isTestEnv = import.meta.env.MODE === "test" || process.env.NODE_ENV === "test";
    const mustAuth = isAuthRequired();

    // If auth is required (e.g., E2E talking to secured WS), wait until user is available
    if (!auth.currentUser && mustAuth) {
        for (let i = 0; i < 50; i++) { // up to ~5s
            await new Promise(resolve => setTimeout(resolve, 100));
            if (auth.currentUser) break;
        }
    }

    if (!auth.currentUser) {
        if (isTestEnv && !mustAuth) {
            // Allow offline WS-less flows in unit/integration tests
            return "";
        }
        // If we reach here, auth is required but not available
        throw new Error("No Firebase user available for Yjs auth");
    }

    const token = await auth.currentUser.getIdToken(true);
    if (!token) {
        if (isTestEnv && !mustAuth) {
            return "";
        }
        throw new Error("No Firebase ID token available");
    }
    return token;
}

export async function connectPageDoc(doc: Y.Doc, projectId: string, pageId: string): Promise<PageConnection> {
    const wsBase = getWsBase();
    const room = pageRoomPath(projectId, pageId);
    if (typeof indexedDB !== "undefined" && isIndexedDBEnabled()) {
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
    if (typeof indexedDB !== "undefined" && isIndexedDBEnabled()) {
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
    if (typeof indexedDB !== "undefined" && isIndexedDBEnabled()) {
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

export async function createMinimalProjectConnection(projectId: string): Promise<{
    doc: Y.Doc;
    provider: WebsocketProvider;
    dispose: () => void;
}> {
    const doc = new Y.Doc({ guid: projectId });
    const wsBase = getWsBase();
    const room = projectRoomPath(projectId);
    let token = "";
    try {
        token = await getFreshIdToken();
    } catch {
        token = "";
    }
    const provider = new WebsocketProvider(wsBase, room, doc, {
        params: token ? { auth: token } : undefined,
        connect: isWsEnabled(),
    });
    const dispose = () => {
        try {
            provider.destroy();
        } catch {}
        try {
            doc.destroy();
        } catch {}
    };
    return { doc, provider, dispose };
}
