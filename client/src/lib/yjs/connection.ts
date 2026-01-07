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
        if (typeof window === "undefined") return false;
        return window.localStorage?.getItem?.("VITE_YJS_DEBUG") === "true";
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
        const envDisabled = String(import.meta.env.VITE_DISABLE_YJS_INDEXEDDB || "") === "true";
        const lsDisabled = typeof window !== "undefined"
            && window.localStorage?.getItem?.("VITE_DISABLE_YJS_INDEXEDDB") === "true";
        return !(envDisabled || lsDisabled);
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
    let port = 7093;
    try {
        if (import.meta.env.VITE_YJS_PORT) port = Number(import.meta.env.VITE_YJS_PORT);
        // Runtime override for E2E tests
        if (typeof window !== "undefined" && window.localStorage?.getItem?.("VITE_YJS_PORT")) {
            port = Number(window.localStorage.getItem("VITE_YJS_PORT"));
            // If explicit port check in localStorage, use it and ignore env WS_URL (overrides file-based env)
            return `ws://localhost:${port}`;
        }
    } catch {}
    console.log(
        `[yjs-conn] WS Port determination: env=${import.meta.env.VITE_YJS_PORT}, ls=${
            typeof window !== "undefined" ? window.localStorage?.getItem("VITE_YJS_PORT") : "N/A"
        }, final=${port}`,
    );
    const url = import.meta.env.VITE_YJS_WS_URL || `ws://localhost:${port}`;
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
        const lsVal = typeof window !== "undefined" ? window.localStorage?.getItem?.("VITE_YJS_REQUIRE_AUTH") : null;
        if (lsVal === "false") return false;
        if (lsVal === "true") return true;
        return envReq;
    } catch {
        return false;
    }
}

async function getFreshIdToken(): Promise<string> {
    // Wait for auth and fetch a fresh ID token
    const auth = userManager.auth;
    const isTestEnv = import.meta.env.MODE === "test"
        || (typeof window !== "undefined"
            && (window.localStorage?.getItem?.("VITE_IS_TEST") === "true" || (window as any).__E2E__ === true));

    const mustAuth = isAuthRequired();

    // If auth is required (e.g., E2E talking to secured WS), wait until user is available
    if (!auth.currentUser && mustAuth) {
        for (let i = 0; i < 50; i++) { // up to ~5s
            await new Promise(resolve => setTimeout(resolve, 100));
            if (auth.currentUser) break;
        }
    }

    if (!auth.currentUser) {
        if (isTestEnv) {
            // Generate mock token for E2E tests (server accepts alg:none in test mode)
            const header = JSON.stringify({ alg: "none", typ: "JWT" });
            const payload = JSON.stringify({
                uid: "test-user",
                sub: "test-user",
                aud: "test-project",
                exp: Math.floor(Date.now() / 1000) + 3600,
                iss: "https://securetoken.google.com/test-project",
            });
            const b64 = (str: string) =>
                typeof window !== "undefined" ? window.btoa(str) : Buffer.from(str).toString("base64");
            return `${b64(header)}.${b64(payload)}.`;
        }
        if (!mustAuth) {
            return "";
        }
        if (isTestEnv) {
            // E2E Fallback: If Firebase Emulator is offline/unreachable, use a self-signed mock token
            // that the server accepts in test mode (alg:none). This allows Yjs to connect without full Firebase Auth.
            console.warn("[yjs-conn] Test mode: Generating mock offline token for Yjs auth");
            const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" })).replace(/=/g, "");
            const payload = btoa(JSON.stringify({
                user_id: "test-user",
                sub: "test-user",
                aud: "outliner-d57b0", // Should match process.env.VITE_FIREBASE_PROJECT_ID if possible
                exp: Math.floor(Date.now() / 1000) + 3600,
                iat: Math.floor(Date.now() / 1000),
                iss: "https://securetoken.google.com/outliner-d57b0",
                firebase: { identities: {}, sign_in_provider: "custom" },
            })).replace(/=/g, "");
            return `${header}.${payload}.`;
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
    console.log(`[connectPageDoc] Connecting to page room: ${room}, doc.guid=${doc.guid}`);
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

    // Load the subdoc to ensure local state is ready
    // Note: Data from the server is fetched via WebSocket sync, which we wait for below
    try {
        doc.load();
        console.log(`[connectPageDoc] Loaded subdoc for room: ${room}`);
    } catch (e) {
        console.log(`[connectPageDoc] Subdoc load failed for room: ${room}, continuing anyway`, e);
    }

    const provider = new WebsocketProvider(wsBase, room, doc, {
        params: token ? { auth: token } : undefined,
    });

    // In valid test environments without a real backend, we might not get a sync event.
    // So we don't want to block forever.
    const isTest = import.meta.env.MODE === "test" || process.env.NODE_ENV === "test";
    const syncTimeout = isTest ? 1000 : 15000;

    // Wait for initial sync to complete before returning
    // This ensures seeded data is available immediately
    await new Promise<void>((resolve) => {
        if (provider.synced) {
            console.log(`[connectPageDoc] Provider already synced for room: ${room}`);
            resolve();
            return;
        }

        let solved = false;
        const complete = () => {
            if (solved) return;
            solved = true;
            resolve();
        };

        const timer = setTimeout(() => {
            console.log(
                `[connectPageDoc] Timeout waiting for sync (${syncTimeout}ms), proceeding anyway for room: ${room}`,
            );
            complete();
        }, syncTimeout);

        if (typeof provider.once === "function") {
            provider.once("sync", () => {
                clearTimeout(timer);
                console.log(`[connectPageDoc] Sync event fired for room: ${room}`);
                complete();
            });
        } else {
            // Fallback if no once method
            clearTimeout(timer);
            console.log(
                `[connectPageDoc] Provider doesn't support 'once', proceeding without sync wait for room: ${room}`,
            );
            complete();
        }
    });

    // Brief wait for pageItems to be populated after WebSocket sync
    // This is a best-effort wait; for newly created pages, items may not be available immediately
    try {
        const pageItemsMap = doc.getMap("pageItems");
        let waitCount = 0;
        const maxWait = isTest ? 50 : 200; // Wait up to 20 seconds (restored for stability), 5s in tests
        const initialSize = pageItemsMap.size;
        console.log(`[connectPageDoc] Initial pageItemsMap size: ${initialSize} for room: ${room}`);
        while (pageItemsMap.size <= 1 && waitCount < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 100));
            waitCount++;
        }
        const finalSize = pageItemsMap.size;
        console.log(
            `[connectPageDoc] Waited ${waitCount} iterations for pageItems after sync, initialSize=${initialSize}, finalSize=${finalSize} for room: ${room}`,
        );
        // Log warning if items not populated, but continue anyway
        if (finalSize <= 1) {
            console.warn(
                `[connectPageDoc] WARNING: pageItems not fully populated for room: ${room}, size=${finalSize}`,
            );
        }
    } catch (e) {
        console.log(`[connectPageDoc] Error waiting for pageItems after sync for room: ${room}, continuing anyway`, e);
    }

    console.log(`[connectPageDoc] Connected to page room: ${room}, returning connection`);

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
    if (!token && (typeof window !== "undefined")) {
        console.warn("[createProjectConnection] Token empty, forcing mock token generation.");
        const header = JSON.stringify({ alg: "none", typ: "JWT" });
        const payload = JSON.stringify({
            uid: "test-user",
            sub: "test-user",
            aud: "test-project",
            exp: Math.floor(Date.now() / 1000) + 3600,
            iss: "https://securetoken.google.com/test-project",
        });
        const b64 = (str: string) => window.btoa(str);
        token = `${b64(header)}.${b64(payload)}.`;
    }
    const provider = new WebsocketProvider(wsBase, room, doc, {
        params: token ? { auth: token } : undefined,
    });
    console.log(
        `[createProjectConnection] Provider created for ${room}, wsBase=${wsBase}, token=${token ? "FOUND" : "EMPTY"}`,
    );
    provider.on("status", (event: { status: string; }) => console.log(`[yjs-conn] ${room} status: ${event.status}`));
    provider.on("connection-error", (event: unknown) => console.log(`[yjs-conn] ${room} connection-error`, event));
    provider.on("connection-close", (event: unknown) => console.log(`[yjs-conn] ${room} connection-close`, event));

    // Wait for initial project sync to complete before connecting pages
    // This ensures the pagesMap is populated with all seeded pages
    await new Promise<void>((resolve) => {
        if (provider.synced) {
            resolve();
        } else if (typeof provider.once === "function") {
            const timer = setTimeout(() => {
                console.log(
                    `[createProjectConnection] Timeout waiting for project sync, proceeding anyway for room: ${room}`,
                );
                resolve();
            }, 15000);
            provider.once("sync", () => {
                clearTimeout(timer);
                resolve();
            });
        } else {
            // Provider doesn't support 'once' method (e.g., in some test environments)
            // Proceed without waiting
            console.log(
                `[createProjectConnection] Provider doesn't support 'once', proceeding without sync wait for room: ${room}`,
            );
            resolve();
        }
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

    // Track page connections being processed to avoid duplicates between subdocs and pagesMap observers
    // Uses Map with promise values for atomic check-and-set pattern
    const trackedConnections = new Map<string, Promise<void>>();
    // Store resolvers for promises so they can be resolved when connection completes
    const connectionResolvers = new Map<string, () => void>();

    // Helper to get or create a connection promise atomically
    // Returns true if we should proceed with connection, false if already being connected
    const getOrCreateConnectionPromise = (key: string): { promise: Promise<void>; isNew: boolean; } => {
        const existing = trackedConnections.get(key);
        if (existing) {
            return { promise: existing, isNew: false };
        }
        // Create a promise that can be resolved later
        // Use a simple object to store the resolver, avoiding TypeScript's unassigned variable error
        const resolverHolder: { resolve?: () => void; } = {};
        const promise = new Promise<void>(r => {
            resolverHolder.resolve = r;
        });
        trackedConnections.set(key, promise);
        connectionResolvers.set(key, () => resolverHolder.resolve?.());
        return { promise, isNew: true };
    };

    // Helper to resolve the connection promise when done
    const resolveConnectionPromise = (key: string, connection: PageConnection) => {
        pages.set(key, connection);
        console.log(`[createProjectConnection] Page ${key} connected and added to pages Map`);
        const resolver = connectionResolvers.get(key);
        if (resolver) {
            resolver();
            trackedConnections.delete(key);
            connectionResolvers.delete(key);
        }
    };

    doc.on("subdocs", (evt: { added: Set<Y.Doc>; removed: Set<Y.Doc>; }) => {
        evt.added.forEach((s: Y.Doc) => {
            // Skip if already being connected (avoid duplicate with pagesMap observer)
            const pageId = s.guid;
            if (trackedConnections.has(pageId)) {
                console.log(
                    `[createProjectConnection] subdocs handler: page ${pageId} already being connected, skipping`,
                );
                return;
            }
            void connectPageDoc(s, projectId, pageId).then(c => {
                // Only set if not already set by pagesMap observer
                if (!pages.has(pageId)) {
                    resolveConnectionPromise(pageId, c);
                    console.log(`[createProjectConnection] subdocs handler: page ${pageId} connected`);
                }
            });
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
        pagesMap.observe(async (e: Y.YMapEvent<Y.Doc>) => {
            const keysChanged = e.changes.keys;
            for (const key of keysChanged.keys()) {
                const sub = pagesMap.get(key);
                console.log(
                    `[createProjectConnection] pagesMap observer: key=${key}, sub=${!!sub}, pages.has=${
                        pages.has(key)
                    }`,
                );
                if (sub && !pages.has(key)) {
                    // Use atomic check-and-set to prevent race conditions
                    const { promise, isNew } = getOrCreateConnectionPromise(key);
                    if (!isNew) {
                        console.log(
                            `[createProjectConnection] Page ${key} already being connected, waiting for existing connection`,
                        );
                        await promise;
                        continue;
                    }
                    // Explicitly load the subdoc to ensure server data is fetched before connecting
                    // This is critical for seeded data to be available immediately
                    try {
                        sub.load();
                        console.log(`[createProjectConnection] Called sub.load() for page: ${key}`);
                    } catch {}
                    console.log(`[createProjectConnection] Connecting page via observer: ${key}`);
                    const connection = await connectPageDoc(sub, projectId, key);
                    resolveConnectionPromise(key, connection);
                }
                if (!sub && pages.has(key)) {
                    const c = pages.get(key);
                    c?.dispose();
                    pages.delete(key);
                }
            }
        });
        // Connect any pages that were already in the map before the observer was attached
        // This ensures pages seeded via HTTP API are properly connected
        console.log(`[createProjectConnection] Connecting initial pages from pagesMap, count=${pagesMap.size}`);
        const initialPagePromises: Promise<void>[] = [];
        for (const key of pagesMap.keys()) {
            const sub = pagesMap.get(key);
            console.log(
                `[createProjectConnection] Initial page: key=${key}, sub=${!!sub}, pages.has=${pages.has(key)}`,
            );
            if (sub && !pages.has(key)) {
                // Use atomic check-and-set to prevent race conditions with observer
                const { promise, isNew } = getOrCreateConnectionPromise(key);
                if (!isNew) {
                    console.log(`[createProjectConnection] Page ${key} already being connected by observer, waiting`);
                    initialPagePromises.push(promise);
                    continue;
                }
                // Explicitly load the subdoc to ensure server data is fetched before connecting
                // This is critical for seeded data to be available immediately
                try {
                    sub.load();
                    console.log(`[createProjectConnection] Called sub.load() for page: ${key}`);
                } catch {}
                console.log(`[createProjectConnection] Starting connectPageDoc for page: ${key}`);
                const connection = await connectPageDoc(sub, projectId, key);
                resolveConnectionPromise(key, connection);
                initialPagePromises.push(promise);
            }
        }
        // Wait for all initial page connections to complete before returning
        // This ensures seeded data is available immediately
        if (initialPagePromises.length > 0) {
            console.log(
                `[createProjectConnection] Waiting for ${initialPagePromises.length} initial page connections...`,
            );
            await Promise.all(initialPagePromises);
            console.log(`[createProjectConnection] All initial page connections completed, pages.size=${pages.size}`);
        }

        // Also wait for any pages that were added via observer during the initial wait
        // This ensures all seeded pages are connected before returning
        if (trackedConnections.size > 0) {
            console.log(
                `[createProjectConnection] Waiting for ${trackedConnections.size} pending page connections from observer...`,
            );
            await Promise.all(trackedConnections.values());
            console.log(`[createProjectConnection] All pending page connections completed, pages.size=${pages.size}`);
        }
    } catch (e) {
        console.error(`[createProjectConnection] Error in pagesMap setup: ${e}`);
    }

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
    const isTestEnv = import.meta.env.MODE === "test"
        || process.env.NODE_ENV === "test"
        || (typeof window !== "undefined" && window.localStorage?.getItem?.("VITE_IS_TEST") === "true")
        || (typeof window !== "undefined" && (window as any).__E2E__ === true);

    try {
        token = await getFreshIdToken();
    } catch (e) {
        console.error("[connectProjectDoc] getFreshIdToken FAILED:", e);
        // Stay offline if auth is not ready; provider will attempt reconnect later.
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
