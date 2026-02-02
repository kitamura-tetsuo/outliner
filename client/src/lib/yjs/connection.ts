import { HocuspocusProvider } from "@hocuspocus/provider";
import type { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { userManager } from "../../auth/UserManager";
import { createPersistence, waitForSync } from "../yjsPersistence";
import { pageRoomPath, projectRoomPath } from "./roomPath";
import { yjsService } from "./service";
import { attachTokenRefresh, type TokenRefreshableProvider } from "./tokenRefresh";

// Minimal guarded debug logging for initial sync progress (disabled in production by default)
function isConnDebugEnabled(): boolean {
    try {
        if (typeof window === "undefined") return false;
        return window.localStorage?.getItem?.("VITE_YJS_DEBUG") === "true";
    } catch {
        return false;
    }
}

function attachConnDebug(label: string, provider: HocuspocusProvider, awareness: Awareness | null, doc: Y.Doc) {
    if (!isConnDebugEnabled()) return;
    try {
        // provider.synced transitions
        provider.on("synced", (data: { state: boolean; }) => {
            console.log(`[yjs-conn] ${label} sync=${data.state}`);
        });
        // awareness states count
        const logAwareness = () => {
            try {
                const states = (awareness as { getStates?: () => Map<number, unknown>; })?.getStates?.();
                const count = states?.size ?? 0;
                console.log(`[yjs-conn] ${label} awareness.states=${count}`);
            } catch {}
        };
        if (awareness) {
            awareness.on(
                "change",
                logAwareness as (event: { added: number[]; removed: number[]; updated: number[]; }) => void,
            );
        }
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
    return true; // Enable IndexedDB for offline support and reload persistence
}

export type PageConnection = {
    doc: Y.Doc;
    provider: HocuspocusProvider;
    awareness: Awareness | null;
    dispose: () => void;
};

export type ProjectConnection = {
    doc: Y.Doc;
    provider: HocuspocusProvider;
    awareness: Awareness | null;
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
 * WebSocket Enable/Disable Priority (Common for Production/Dev/Test)
 * 1) Force Enable: localStorage.VITE_YJS_FORCE_WS === "true" → Always true (Exception for Test/E2E. Overrides disablement)
 * 2) Disable: VITE_YJS_DISABLE_WS → false (Disabled if "true" in either env or localStorage)
 * 3) Explicit Enable: localStorage.VITE_YJS_ENABLE_WS === "true" → true (Valid only if not disabled by 2))
 * 4) Test Default: MODE==="test" or VITE_IS_TEST==="true" (env or localStorage) → true (Subject to disablement by 2))
 * 5) Default: true if none of the above apply
 *
 * Operational Guidelines:
 * - Logic is identical for Production/Development. Avoid using localStorage overrides in production.
 * - .env.test sets VITE_YJS_DISABLE_WS=true by default to suppress WS handshake noise.
 *   E2E tests requiring WS should force connection by setting VITE_YJS_FORCE_WS=true in localStorage (e.g., via addInitScript).
 * - This function is the single source of truth. Callers should rely solely on this return value.
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
    console.log(`[getFreshIdToken] isTestEnv=${isTestEnv}, auth.currentUser=${!!auth.currentUser}`);

    const generateMockToken = () => {
        // Generate mock token for E2E tests (server accepts alg:none in test mode)
        // Safe to use simple generation here matching server expectations
        const header = JSON.stringify({ alg: "none", typ: "JWT" });
        const payload = JSON.stringify({
            uid: "test-user",
            sub: "test-user",
            aud: "outliner-d57b0",
            exp: Math.floor(Date.now() / 1000) + 3600,
            iss: "https://securetoken.google.com/outliner-d57b0",
        });
        const b64 = (str: string) =>
            typeof window !== "undefined" ? window.btoa(str) : Buffer.from(str).toString("base64");
        return `${b64(header)}.${b64(payload)}.`;
    };

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
            return generateMockToken();
        }
        if (!mustAuth) {
            return "";
        }
        throw new Error("No Firebase user available for Yjs auth");
    }

    try {
        const token = await auth.currentUser.getIdToken();
        if (!token) throw new Error("Token is empty");
        return token;
    } catch (e) {
        if (isTestEnv) {
            console.warn("[getFreshIdToken] Auth failed in test mode, using mock token:", e);
            return generateMockToken();
        }
        throw e;
    }
}

/**
 * Constructs the WebSocket URL including room path and auth token.
 * The server requires the room name in the URL path for authentication validation.
 */
function constructWsUrl(wsBase: string, room: string, token: string): string {
    // Ensure no double slashes when joining base and room
    const baseUrl = wsBase.replace(/\/$/, "");
    const roomPath = room.startsWith("/") ? room.slice(1) : room;
    const url = `${baseUrl}/${roomPath}`;
    return token ? `${url}?token=${token}` : url;
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

    // HocuspocusProvider uses a token function for dynamic token refresh
    // eslint-disable-next-line prefer-const
    let provider: HocuspocusProvider;
    const tokenFn = async () => {
        try {
            const t = await getFreshIdToken();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const config = provider.configuration as any;
            if (provider && config?.url && typeof config.url === "string" && t) {
                const urlObj = new URL(config.url);
                urlObj.searchParams.set("token", t);
                config.url = urlObj.toString();
                // Also update the provider.url property if it exists, as some versions/usages might rely on it
                if ((provider as TokenRefreshableProvider).url) {
                    (provider as TokenRefreshableProvider).url = config.url;
                }
                console.log("[connectPageDoc] Updated provider URL with fresh token");
            }
            return t;
        } catch {
            return "";
        }
    };

    // Load the subdoc to ensure local state is ready
    // Note: Data from the server is fetched via WebSocket sync, which we wait for below
    try {
        doc.load();
        console.log(`[connectPageDoc] Loaded subdoc for room: ${room}`);
    } catch (e) {
        console.log(`[connectPageDoc] Subdoc load failed for room: ${room}, continuing anyway`, e);
    }

    // Ensure token is available for initial connection URL (required by server upgrade handler)
    let initialToken = "";
    try {
        initialToken = await getFreshIdToken();
    } catch {}

    provider = new HocuspocusProvider({
        url: constructWsUrl(wsBase, room, initialToken),
        name: room,
        document: doc,
        token: tokenFn,
    });

    // In valid test environments without a real backend, we might not get a sync event.
    // So we don't want to block forever.
    const isTest = import.meta.env.MODE === "test" || process.env.NODE_ENV === "test";
    const syncTimeout = isTest ? 5000 : 15000;
    provider.on("synced", (data: { state: boolean; }) => {
        console.log(`[connectPageDoc] Sync event received for ${room}, isSynced=${data.state}`);
    });

    // Wait for initial sync to complete before returning
    // This ensures seeded data is available immediately
    await new Promise<void>((resolve) => {
        if (provider.isSynced) {
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

        const syncHandler = (data: { state: boolean; }) => {
            if (data.state) {
                clearTimeout(timer);
                console.log(`[connectPageDoc] Sync event fired for room: ${room}`);
                provider.off("synced", syncHandler);
                complete();
            }
        };
        provider.on("synced", syncHandler);
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
    if (current && awareness) {
        awareness.setLocalStateField("user", {
            userId: current.id,
            name: current.name,
            color: undefined,
        });
    }
    const unbind = yjsService.bindPagePresence(awareness as Awareness);
    const unsub = attachTokenRefresh(provider as any); // HocuspocusProvider compatible
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

    // Attach fatal error handling for page doc
    // Attach fatal error handling for page doc
    provider.on("close", (event: { code: number; reason: string; }) => {
        console.log(`[yjs-conn] ${room} connection-close code=${event.code} reason=${event.reason}`);

        // Handle Auth errors (4001: Unauthorized, 4003: Forbidden)
        if ([4001, 4003].includes(event.code)) {
            console.log(`[yjs-conn] Auth error ${event.code} detected for ${room}, triggering token refresh...`);
            // Force token refresh
            void userManager.refreshToken().then(() => {
                console.log(`[yjs-conn] Token refresh triggered for ${room}`);
            });
            return;
        }

        // Fatal errors: 4006 (Max Sockets per Room), 4008 (Max Sockets Total/IP)
        // REMOVED 4001/4003/4004 to allow retry with fresh token
        if ([4006, 4008].includes(event.code)) {
            console.error(`[yjs-conn] FATAL ERROR: ${event.code} ${event.reason}. Stopping reconnection for ${room}`);
            provider.destroy();
        }
    });
    return { doc, provider, awareness, dispose };
}

export async function createProjectConnection(projectId: string): Promise<ProjectConnection> {
    console.log(`[createProjectConnection] Starting for projectId=${projectId}`);
    const doc = new Y.Doc({ guid: projectId });
    const wsBase = getWsBase();
    const room = projectRoomPath(projectId);
    console.log(`[createProjectConnection] wsBase=${wsBase}, room=${room}`);

    // Attach IndexedDB persistence and wait for initial sync
    if (typeof indexedDB !== "undefined" && isIndexedDBEnabled()) {
        try {
            const persistence = createPersistence(room, doc);
            await waitForSync(persistence);
        } catch { /* no-op in Node */ }
    }

    // HocuspocusProvider uses a token function for dynamic token refresh
    // eslint-disable-next-line prefer-const
    let provider: HocuspocusProvider;
    const tokenFn = async () => {
        try {
            const t = await getFreshIdToken();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const config = provider.configuration as any;
            if (provider && config?.url && typeof config.url === "string" && t) {
                const urlObj = new URL(config.url);
                urlObj.searchParams.set("token", t);
                config.url = urlObj.toString();
                // Also update the provider.url property if it exists
                if ((provider as TokenRefreshableProvider).url) {
                    (provider as TokenRefreshableProvider).url = config.url;
                }
                console.log("[createProjectConnection] Updated provider URL with fresh token");
            }
            return t;
        } catch {
            return "";
        }
    };

    // Ensure token is available for initial connection URL (required by server upgrade handler)
    let initialToken = "";
    try {
        initialToken = await getFreshIdToken();
    } catch {}

    provider = new HocuspocusProvider({
        url: constructWsUrl(wsBase, room, initialToken),
        name: room,
        document: doc,
        token: tokenFn,
    });
    console.log(
        `[createProjectConnection] Provider created for ${room}, wsBase=${wsBase}`,
    );
    provider.on("status", (event: { status: string; }) => console.log(`[yjs-conn] ${room} status: ${event.status}`));
    provider.on("close", (event: { code: number; reason: string; }) => {
        console.log(`[yjs-conn] ${room} connection-close code=${event.code} reason=${event.reason}`);

        // Handle Auth errors (4001: Unauthorized, 4003: Forbidden)
        if ([4001, 4003].includes(event.code)) {
            console.log(`[yjs-conn] Auth error ${event.code} detected for ${room}, triggering token refresh...`);
            // Force token refresh
            void userManager.refreshToken().then(() => {
                console.log(`[yjs-conn] Token refresh triggered for ${room}`);
            });
            return;
        }

        // Fatal errors: 4006 (Max Sockets per Room), 4008 (Max Sockets Total/IP)
        // REMOVED 4001/4003/4004 to allow retry with fresh token
        if ([4006, 4008].includes(event.code)) {
            console.error(`[yjs-conn] FATAL ERROR: ${event.code} ${event.reason}. Stopping reconnection for ${room}`);
            provider.configuration.token = async () => Promise.resolve(""); // Prevent further auth attempts
            provider.disconnect(); // Ensure completely stopped
            // destroy() might be better but disconnect() + nuke config is safer to not break references
            provider.destroy();
        }
    });
    provider.on("disconnect", (event: { code: number; reason: string; }) => {
        console.log(`[yjs-conn] ${room} disconnect code=${event.code} reason=${event.reason}`);
    });

    // Wait for initial project sync to complete before connecting pages
    // This ensures the pagesMap is populated with all seeded pages
    await new Promise<void>((resolve) => {
        if (provider.isSynced) {
            resolve();
        } else {
            const timer = setTimeout(() => {
                console.log(
                    `[createProjectConnection] Timeout waiting for project sync, proceeding anyway for room: ${room}`,
                );
                resolve();
            }, 15000);

            const syncHandler = (data: { state: boolean; }) => {
                if (data.state) {
                    clearTimeout(timer);
                    provider.off("synced", syncHandler);
                    resolve();
                }
            };
            provider.on("synced", syncHandler);
        }
    });

    // Awareness (presence)
    const awareness = provider.awareness;
    // Debug hook (guarded)
    attachConnDebug(room, provider, awareness, doc);
    const current = userManager.getCurrentUser();
    if (current && awareness) {
        awareness.setLocalStateField("user", {
            userId: current.id,
            name: current.name,
            color: undefined,
        });
    }
    const unbind = yjsService.bindProjectPresence(awareness as Awareness);

    // Refresh auth param on token refresh
    const unsub = attachTokenRefresh(provider as TokenRefreshableProvider);

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
    provider: HocuspocusProvider;
    awareness: Awareness | null;
}> {
    const wsBase = getWsBase();
    const room = projectRoomPath(projectId);
    if (typeof indexedDB !== "undefined" && isIndexedDBEnabled()) {
        try {
            const persistence = createPersistence(room, doc);
            await waitForSync(persistence);
        } catch { /* no-op in Node */ }
    }

    // HocuspocusProvider uses a token function for dynamic token refresh
    // eslint-disable-next-line prefer-const
    let provider: HocuspocusProvider;
    const tokenFn = async () => {
        try {
            const t = await getFreshIdToken();
            if (provider && provider.configuration?.url && typeof provider.configuration.url === "string" && t) {
                const urlObj = new URL(provider.configuration.url);
                urlObj.searchParams.set("token", t);
                provider.configuration.url = urlObj.toString();
                // Also update the provider.url property if it exists
                if ((provider as TokenRefreshableProvider).url) {
                    (provider as TokenRefreshableProvider).url = provider.configuration.url;
                }
                console.log("[connectProjectDoc] Updated provider URL with fresh token");
            }
            return t;
        } catch (e) {
            console.error("[connectProjectDoc] getFreshIdToken FAILED:", e);
            return "";
        }
    };

    // Ensure token is available for initial connection URL (required by server upgrade handler)
    let initialToken = "";
    try {
        initialToken = await getFreshIdToken();
    } catch (e) {
        console.error("[connectProjectDoc] getFreshIdToken FAILED:", e);
    }

    provider = new HocuspocusProvider({
        url: constructWsUrl(wsBase, room, initialToken),
        name: room,
        document: doc,
        token: tokenFn,
    });
    const awareness = provider.awareness;
    // Debug hook (guarded)
    attachConnDebug(room, provider, awareness, doc);
    const current = userManager.getCurrentUser();
    if (current && awareness) {
        awareness.setLocalStateField("user", {
            userId: current.id,
            name: current.name,
            color: undefined,
        });
    }
    // Refresh auth param on token refresh
    attachTokenRefresh(provider as TokenRefreshableProvider);
    return { provider, awareness };
}

export async function createMinimalProjectConnection(projectId: string): Promise<{
    doc: Y.Doc;
    provider: HocuspocusProvider;
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

    // HocuspocusProvider uses a token function for dynamic token refresh
    // eslint-disable-next-line prefer-const
    let provider: HocuspocusProvider;
    const tokenFn = async () => {
        try {
            const t = await getFreshIdToken();
            if (provider && provider.configuration?.url && typeof provider.configuration.url === "string" && t) {
                const urlObj = new URL(provider.configuration.url);
                urlObj.searchParams.set("token", t);
                provider.configuration.url = urlObj.toString();
                if ((provider as TokenRefreshableProvider).url) {
                    (provider as TokenRefreshableProvider).url = provider.configuration.url;
                }
            }
            return t;
        } catch {
            return "";
        }
    };

    // Ensure token is available for initial connection URL (required by server upgrade handler)
    let initialToken = "";
    try {
        initialToken = await getFreshIdToken();
    } catch {}

    provider = new HocuspocusProvider({
        url: constructWsUrl(wsBase, room, initialToken),
        name: room,
        document: doc,
        token: tokenFn,
    });
    // HocuspocusProvider connects automatically, no need to call connect()

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
