import { HocuspocusProvider } from "@hocuspocus/provider";
import type { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { userManager } from "../../auth/UserManager";
import { createPersistence, waitForSync } from "../yjsPersistence";
import { projectRoomPath } from "./roomPath";
import { yjsService } from "./service";
import { attachTokenRefresh, type TokenRefreshableProvider } from "./tokenRefresh";

// Helper to detect test environment
function isTestEnv(): boolean {
    return import.meta.env.MODE === "test"
        || (typeof window !== "undefined" && (window as any).__E2E__)
        || (typeof window !== "undefined" && window.localStorage?.getItem?.("VITE_IS_TEST") === "true");
}

// Minimal guarded debug logging for initial sync progress (disabled in production by default)
function isConnDebugEnabled(): boolean {
    // Force disable in test environments to prevent log flooding and timeouts
    if (isTestEnv()) return false;

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

export type ProjectConnection = {
    doc: Y.Doc;
    provider: HocuspocusProvider;
    awareness: Awareness | null;
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

    if (!isTestEnv()) {
        console.log(
            `[yjs-conn] WS Port determination: env=${import.meta.env.VITE_YJS_PORT}, ls=${
                typeof window !== "undefined" ? window.localStorage?.getItem("VITE_YJS_PORT") : "N/A"
            }, final=${port}`,
        );
    }
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
    const isTest = isTestEnv();
    if (!isTest) {
        console.log(`[getFreshIdToken] isTestEnv=${isTest}, auth.currentUser=${!!auth.currentUser}`);
    }

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
        if (isTest) {
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
        if (isTest) {
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

export async function createProjectConnection(projectId: string): Promise<ProjectConnection> {
    const isTest = isTestEnv();
    if (!isTest) console.log(`[createProjectConnection] Starting for projectId=${projectId}`);
    const doc = new Y.Doc({ guid: projectId });
    const wsBase = getWsBase();
    const room = projectRoomPath(projectId);
    if (!isTest) console.log(`[createProjectConnection] wsBase=${wsBase}, room=${room}`);

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
                if (!isTest) console.log("[createProjectConnection] Updated provider URL with fresh token");
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
    if (!isTest) {
        console.log(
            `[createProjectConnection] Provider created for ${room}, wsBase=${wsBase}`,
        );
    }
    provider.on("status", (event: { status: string; }) => {
        if (!isTest) console.log(`[yjs-conn] ${room} status: ${event.status}`);
    });
    provider.on("close", (event: { code: number; reason: string; }) => {
        if (!isTest) console.log(`[yjs-conn] ${room} connection-close code=${event.code} reason=${event.reason}`);

        // Handle Auth errors (4001: Unauthorized)
        if (event.code === 4001) {
            if (!isTest) {
                console.log(`[yjs-conn] Auth error ${event.code} detected for ${room}, triggering token refresh...`);
            }
            // Force token refresh
            void userManager.refreshToken().then(() => {
                if (!isTest) console.log(`[yjs-conn] Token refresh triggered for ${room}`);
            });
            return;
        }

        // Fatal errors: 4003 (Forbidden), 4006 (Max Sockets per Room), 4008 (Max Sockets Total/IP)
        // 4003 is treated as fatal access denied (user not in project list)
        if ([4003, 4006, 4008].includes(event.code)) {
            console.error(`[yjs-conn] FATAL ERROR: ${event.code} ${event.reason}. Stopping reconnection for ${room}`);
            provider.configuration.token = async () => Promise.resolve(""); // Prevent further auth attempts
            provider.disconnect(); // Ensure completely stopped
            // destroy() might be better but disconnect() + nuke config is safer to not break references
            provider.destroy();
        }
    });
    provider.on("disconnect", (event: { code: number; reason: string; }) => {
        if (!isTest) console.log(`[yjs-conn] ${room} disconnect code=${event.code} reason=${event.reason}`);
    });

    // Wait for initial project sync to complete before connecting pages
    // This ensures the pagesMap is populated with all seeded pages
    await new Promise<void>((resolve, reject) => {
        if (provider.isSynced) {
            resolve();
        } else {
            const timer = setTimeout(() => {
                if (!isTest) {
                    console.log(
                        `[createProjectConnection] Timeout waiting for project sync, proceeding anyway for room: ${room}`,
                    );
                }
                resolve();
            }, 15000);

            const syncHandler = (data: { state: boolean; }) => {
                if (data.state) {
                    clearTimeout(timer);
                    provider.off("synced", syncHandler);
                    provider.off("close", closeHandler);
                    resolve();
                }
            };

            const closeHandler = (event: { code: number; reason: string; }) => {
                if ([4003, 4006, 4008].includes(event.code)) {
                    clearTimeout(timer);
                    provider.off("synced", syncHandler);
                    provider.off("close", closeHandler);
                    console.error(
                        `[createProjectConnection] Fatal close event ${event.code} received during initial sync for ${room}`,
                    );
                    reject(new Error("Access Denied"));
                }
            };

            provider.on("synced", syncHandler);
            provider.on("close", closeHandler);
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
        try {
            doc.destroy();
        } catch {}
    };

    return { doc, provider, awareness, dispose };
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const config = provider.configuration as any;
            if (provider && config?.url && typeof config.url === "string" && t) {
                const urlObj = new URL(config.url);
                urlObj.searchParams.set("token", t);
                config.url = urlObj.toString();
                if ((provider as TokenRefreshableProvider).url) {
                    (provider as TokenRefreshableProvider).url = config.url;
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
