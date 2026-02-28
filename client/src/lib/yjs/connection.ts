import { HocuspocusProvider } from "@hocuspocus/provider";
import type { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { userManager } from "../../auth/UserManager";
import { createPersistence, waitForSync } from "../yjsPersistence";
import { projectRoomPath } from "./roomPath";
import { yjsService } from "./service";
import { attachTokenRefresh, type TokenRefreshableProvider } from "./tokenRefresh";

// Minimal guarded debug logging for initial sync progress (disabled in production by default)
function isConnDebugEnabled(): boolean {
    // ALWAYS return true for now to debug Android issues
    return true;
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
                const tree = doc.getMap("orderedTree") as Y.Map<any>;
                console.log(`[yjs-conn] ${label} awareness.states=${count} tree.size=${tree.size}`);
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
        console.log("[getFreshIdToken] Fetching ID token from Firebase Auth...");
        const token = await auth.currentUser.getIdToken();
        console.log(`[getFreshIdToken] Token fetched successfully (len=${token?.length ?? 0})`);
        if (!token) throw new Error("Token is empty");
        return token;
    } catch (e) {
        console.error("[getFreshIdToken] Failed to fetch token:", e);
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

    // Ensure token is available for initial connection URL (required by server upgrade handler)
    let initialToken = "";
    try {
        initialToken = await getFreshIdToken();
    } catch {}

    // Send a dummy `token` to satisfy HocuspocusServer's unconditional wait for a `MessageType.Auth` message.
    // Since our backend completely handles authentication during the HTTP WebSocket Upgrade via the URL `?token=` parameter,
    // the server suppresses the `onAuthenticate` hook, but still expects the client to trigger the Auth flow!
    const provider = new HocuspocusProvider({
        url: constructWsUrl(wsBase, room, initialToken),
        name: room,
        document: doc,
        token: "1",
    });
    console.log(
        `[createProjectConnection] Provider created for ${room}, wsBase=${wsBase}`,
    );
    provider.on("status", (event: { status: string; }) => {
        console.log(`[yjs-conn] ${room} status: ${event.status}`);
        if (event.status === "connected") {
            const config = provider.configuration as any;
            const hasWsHandshakeToken = config.url?.includes("token=");
            console.log(`[yjs-conn] status:connected current-url-has-token=${hasWsHandshakeToken}`);
        }
    });
    provider.on("close", (event: { code?: number; reason?: string; }) => {
        const code = event.code;
        const reason = event.reason;
        console.warn(`[yjs-conn] ${room} connection-close code=${code} reason=${reason || "None"}`);

        // Handle Auth errors (4001: Unauthorized)
        if (code === 4001) {
            console.log(`[yjs-conn] Auth error ${code} detected for ${room}, triggering token refresh...`);
            // Force token refresh
            void userManager.refreshToken().then(() => {
                console.log(`[yjs-conn] Token refresh triggered for ${room}`);
            });
        }
    });
    provider.on("close", (event: { code?: number; reason?: string; }) => {
        const code = event.code;
        const reason = event.reason;
        console.warn(`[yjs-conn] ${room} connection-close code=${code} reason=${reason || "None"}`);

        // Handle Auth errors (4001: Unauthorized)
        if (code === 4001) {
            console.error(`[yjs-conn] Auth error ${code} detected for ${room}, triggering token refresh...`);
            // Force token refresh
            void userManager.refreshToken().then(() => {
                console.log(`[yjs-conn] Token refresh triggered for ${room}`);
            });
        }
    });

    // Detailed event logging for sync debugging
    provider.on("authenticated", () => console.log(`[yjs-conn] ${room} authenticated`));
    provider.on("authenticationFailed", (data: any) => console.error(`[yjs-conn] ${room} authenticationFailed`, data));
    provider.on("stateless", (data: any) => console.log(`[yjs-conn] ${room} stateless event`, data));
    provider.on("reconnect", () => console.log(`[yjs-conn] ${room} reconnecting...`));
    provider.on("disconnect", (event: { code: number; reason: string; }) => {
        console.log(`[yjs-conn] ${room} disconnect code=${event.code} reason=${event.reason}`);
    });

    // Wait for initial project sync to complete before connecting pages
    // We attach the listener BEFORE any potential async gap to avoid missing it
    await new Promise<void>((resolve, reject) => {
        if (provider.isSynced) {
            console.log(`[createProjectConnection] Room ${room} already synced`);
            const treeSize = (doc.getMap("orderedTree") as Y.Map<any>).size;
            console.log(`[createProjectConnection] Initial tree.size=${treeSize}`);
            resolve();
            return;
        }

        const timer = setTimeout(() => {
            console.warn(
                `[createProjectConnection] Timeout (30s) waiting for project initial sync, proceeding anyway for room: ${room}`,
            );
            const treeSize = (doc.getMap("orderedTree") as Y.Map<any>).size;
            console.log(`[createProjectConnection] Timeout tree.size=${treeSize}`);
            resolve();
        }, 30000);

        const syncHandler = (data?: { state?: boolean; }) => {
            if (!data || data.state !== false) {
                clearTimeout(timer);
                provider.off("synced", syncHandler);
                provider.off("close", closeHandler);
                const treeSize = (doc.getMap("orderedTree") as Y.Map<any>).size;
                console.log(`[createProjectConnection] Sync complete for ${room}. tree.size=${treeSize}`);
                resolve();
            }
        };

        const closeHandler = (event: { code?: number; reason?: string; }) => {
            const code = event.code;
            if (code && [4003, 4006, 4008].includes(code)) {
                clearTimeout(timer);
                provider.off("synced", syncHandler);
                provider.off("close", closeHandler);
                console.error(
                    `[createProjectConnection] Fatal close event ${code} received during initial sync for ${room}`,
                );
                reject(new Error(`Access Denied: ${code}`));
            }
        };

        provider.on("synced", syncHandler);
        provider.on("close", closeHandler);
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

    // Ensure token is available for initial connection URL (required by server upgrade handler)
    let initialToken = "";
    try {
        initialToken = await getFreshIdToken();
    } catch (e) {
        console.error("[connectProjectDoc] getFreshIdToken FAILED:", e);
    }

    const provider = new HocuspocusProvider({
        url: constructWsUrl(wsBase, room, initialToken),
        name: room,
        document: doc,
        token: "1",
    });
    const awareness = provider.awareness;

    provider.on(
        "status",
        (event: { status: string; }) => console.log(`[connectProjectDoc] ${room} status: ${event.status}`),
    );
    provider.on("close", (event: { code?: number; reason?: string; }) => {
        console.warn(
            `[connectProjectDoc] ${room} connection-close code=${event.code} reason=${event.reason || "None"}`,
        );
    });

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

    // Ensure token is available for initial connection URL (required by server upgrade handler)
    let initialToken = "";
    try {
        initialToken = await getFreshIdToken();
    } catch {}

    // Send a dummy `token` for the same reason as in createProjectConnection
    const provider = new HocuspocusProvider({
        url: constructWsUrl(wsBase, room, initialToken),
        name: room,
        document: doc,
        token: "1",
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
