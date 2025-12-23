import type { Awareness } from "y-protocols/awareness";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import { userManager } from "../../auth/UserManager";
import { createPersistence, waitForSync } from "../yjsPersistence";
import { pageRoomPath, projectRoomPath } from "./roomPath";
import { yjsService } from "./service";
import { attachTokenRefresh } from "./tokenRefresh";

// Minimal guarded debug logging for initial sync progress (disabled in production by default)
function isConnDebugEnabled(): boolean {
    try {
        const mode = import.meta.env.MODE as string | undefined;
        const envDebugFlag = import.meta.env.VITE_YJS_CONN_DEBUG;
        const envFlag = String(envDebugFlag || "") === "true";
        const lsFlag = typeof window !== "undefined"
            && window.localStorage?.getItem?.("VITE_YJS_CONN_DEBUG") === "true";
        // Only enable when explicitly opted-in and not on production builds
        const notProd = mode !== "production";
        return notProd && (envFlag || lsFlag);
    } catch {
        return false;
    }
}

function attachConnDebug(label: string, provider: WebsocketProvider, awareness: Awareness, doc: Y.Doc) {
    if (!isConnDebugEnabled()) return;
    try {
        // provider.synced transitions
        provider.on("sync", (s: boolean) => {
            console.log(`[yjs-conn] ${label} sync=${s}`);
        });
        // awareness states count
        const logAwareness = () => {
            try {
                const states = (awareness as { getStates?: () => Map<number, unknown>; })?.getStates?.();
                const count = states?.size ?? 0;
                console.log(`[yjs-conn] ${label} awareness.states=${count}`);
            } catch {}
        };
        awareness.on(
            "change",
            logAwareness as (event: { added: number[]; removed: number[]; updated: number[]; }) => void,
        );
        logAwareness();
        // doc update count and last payload size
        let updCount = 0;
        doc.on("update", (u: Uint8Array) => {
            updCount++;
            const bytes = u?.length ?? 0;
            console.log(`[yjs-conn] ${label} update#${updCount} bytes=${bytes}`);
        });
    } catch {
        // ignore debug wiring errors
    }
}

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

/**
 * WS 有効/無効の決定優先順位（本番/開発/テスト共通）
 * 1) 強制有効: localStorage.VITE_YJS_FORCE_WS === "true" → 常に true（テスト/E2E 用の例外。無効化より強い）
 * 2) 無効化: VITE_YJS_DISABLE_WS → false（env または localStorage のどちらか一方でも "true" なら無効）
 * 3) 明示有効: localStorage.VITE_YJS_ENABLE_WS === "true" → true（2) で無効化されていない場合のみ有効）
 * 4) テスト既定: MODE==="test" または VITE_IS_TEST==="true"（env/localStorage いずれか）→ true（2) があればそちらを優先）
 * 5) 既定: 上記に当てはまらない場合は true
 *
 * 運用指針:
 * - 本番/開発のロジックは同一。プロダクションでの localStorage オーバーライド使用は原則避ける。
 * - .env.test では既定で VITE_YJS_DISABLE_WS=true とし、WS ハンドシェイクのノイズを抑止。
 *   WS が必要な E2E は addInitScript 等で localStorage に VITE_YJS_FORCE_WS=true を付与して接続を強制。
 * - 本関数は判定の単一点（single source of truth）。呼び出し側はこの戻り値のみを信頼する。
 */

function isAuthRequired(): boolean {
    try {
        const envReq = String(import.meta.env.VITE_YJS_REQUIRE_AUTH || "") === "true";
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
            const persistence = createPersistence(room, doc);
            await waitForSync(persistence);
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
    });
    const awareness = provider.awareness;
    // Debug hook (guarded)
    attachConnDebug(room, provider, awareness, doc);
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

    // Attach IndexedDB persistence and wait for initial sync
    if (typeof indexedDB !== "undefined" && isIndexedDBEnabled()) {
        try {
            const persistence = createPersistence(room, doc);
            await waitForSync(persistence);
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
    });

    // Awareness (presence)
    const awareness = provider.awareness;
    // Debug hook (guarded)
    attachConnDebug(room, provider, awareness, doc);
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

    doc.on("subdocs", (evt: { added: Set<Y.Doc>; removed: Set<Y.Doc>; }) => {
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
        pagesMap.observe((e: Y.YMapEvent<Y.Doc>) => {
            const keysChanged = e.changes.keys;
            for (const key of keysChanged.keys()) {
                const sub = pagesMap.get(key);
                if (sub && !pages.has(key)) {
                    // Best-effort, non-blocking connection setup
                    void connectPageDoc(sub, projectId, key).then(c => pages.set(key, c));
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
            const persistence = createPersistence(room, doc);
            await waitForSync(persistence);
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
    });
    const awareness = provider.awareness;
    // Debug hook (guarded)
    attachConnDebug(room, provider, awareness, doc);
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

    // Attach IndexedDB persistence and wait for initial sync
    if (typeof indexedDB !== "undefined" && isIndexedDBEnabled()) {
        try {
            const persistence = createPersistence(room, doc);
            await waitForSync(persistence);
        } catch { /* no-op in Node */ }
    }

    let token = "";
    try {
        token = await getFreshIdToken();
    } catch {
        token = "";
    }
    const provider = new WebsocketProvider(wsBase, room, doc, {
        params: token ? { auth: token } : undefined,
    });
    // 明示接続: 稀に connect: true が反映されないケースがあるため冪等に connect() を呼ぶ
    try {
        (provider as WebsocketProvider & { connect?: () => void; }).connect?.();
    } catch {}
    // Debug hook (guarded)
    attachConnDebug(room, provider, provider.awareness, doc);
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
