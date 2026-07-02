import { getLogger } from "../logger";

const logger = getLogger("yjs-connection");

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
    return import.meta.env.MODE === "test" || import.meta.env.VITE_IS_TEST === "true";
}

function attachConnDebug(label: string, provider: HocuspocusProvider, awareness: Awareness | null, doc: Y.Doc) {
    if (!isConnDebugEnabled()) return;
    try {
        // provider.synced transitions
        provider.on("synced", (data: { state: boolean; }) => {
            logger.info(`[yjs-conn] ${label} sync=${data.state}`);
        });
        // awareness states count
        const logAwareness = () => {
            try {
                const states = (awareness as { getStates?: () => Map<number, unknown>; })?.getStates?.();
                const count = states?.size ?? 0;
                const tree = doc.getMap("orderedTree") as import("yjs").Map<unknown>;
                logger.info(`[yjs-conn] ${label} awareness.states=${count} tree.size=${tree.size}`);
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
            logger.info(`[yjs-conn] ${label} update#${updCount} bytes=${bytes}`);
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
    logger.info(
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
            && (window.localStorage?.getItem?.("VITE_IS_TEST") === "true"
                || window.__E2E__ === true));
    logger.info(`[getFreshIdToken] isTestEnv=${isTestEnv}, auth.currentUser=${!!auth.currentUser}`);

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
        logger.info("[getFreshIdToken] Fetching ID token from Firebase Auth...");
        // Force refresh to ensure we don't start with a stale/expired token from cache
        const token = await auth.currentUser.getIdToken(true);
        logger.info(`[getFreshIdToken] Token fetched successfully (len=${token?.length ?? 0})`);
        if (!token) throw new Error("Token is empty");
        return token;
    } catch (e) {
        logger.error({ error: e }, "[getFreshIdToken] Failed to fetch token");
        if (isTestEnv) {
            logger.warn({ error: e }, "[getFreshIdToken] Auth failed in test mode, using mock token");
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
    logger.info(`[createProjectConnection] Starting for projectId=${projectId}`);
    const doc = new Y.Doc({ guid: projectId });
    const wsBase = getWsBase();
    const room = projectRoomPath(projectId);
    logger.info(`[createProjectConnection] wsBase=${wsBase}, room=${room}`);

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
        if (projectId !== "demo") {
            initialToken = await getFreshIdToken();
        } else {
            initialToken = "1"; // Send dummy token in URL to satisfy strict routing on older servers
        }
    } catch {}

    // Send a dummy `token` to satisfy HocuspocusServer's unconditional wait for a `MessageType.Auth` message.
    // Since our backend completely handles authentication during the HTTP WebSocket Upgrade via the URL `?token=` parameter,
    // the server suppresses the `onAuthenticate` hook, but still expects the client to trigger the Auth flow!
    const provider = new HocuspocusProvider({
        url: constructWsUrl(wsBase, room, initialToken),
        name: room,
        document: doc,
        token: initialToken || "1", // HocuspocusProvider requires a truthy token to send the Auth message, even for unauthenticated rooms like demo.
    });
    logger.info(
        `[createProjectConnection] Provider created for ${room}, wsBase=${wsBase}`,
    );
    provider.on("status", (event: { status: string; }) => {
        logger.info(`[yjs-conn] ${room} status: ${event.status}`);
        if (event.status === "connected") {
            const config = provider.configuration as {
                token: string | (() => string | Promise<string>);
                url?: string;
            };
            const hasWsHandshakeToken = config.url?.includes("token=");
            logger.info(`[yjs-conn] status:connected current-url-has-token=${hasWsHandshakeToken}`);
        }
    });
    provider.on("close", (event: { code?: number; reason?: string; }) => {
        const code = event.code;
        const reason = event.reason;
        logger.warn(`[yjs-conn] ${room} connection-close code=${code} reason=${reason || "None"}`);

        // Handle Auth errors (4001: Unauthorized)
        if (code === 4001) {
            logger.info(`[yjs-conn] Auth error ${code} detected for ${room}, triggering token refresh...`);
            // Force token refresh
            void userManager.refreshToken().then(() => {
                logger.info(`[yjs-conn] Token refresh triggered for ${room}`);
            });
        }
    });

    // Detailed event logging for sync debugging
    provider.on("authenticated", () => logger.info(`[yjs-conn] ${room} authenticated`));
    provider.on(
        "authenticationFailed",
        (data: unknown) => logger.error({ data }, `[yjs-conn] ${room} authenticationFailed`),
    );
    provider.on("stateless", (data: unknown) => logger.info({ data }, `[yjs-conn] ${room} stateless event`));
    provider.on("reconnect", () => logger.info(`[yjs-conn] ${room} reconnecting...`));
    provider.on("disconnect", (event: { code: number; reason: string; }) => {
        logger.info(`[yjs-conn] ${room} disconnect code=${event.code} reason=${event.reason}`);
    });

    // Wait for initial project sync to complete before connecting pages
    // We attach the listener BEFORE any potential async gap to avoid missing it
    await new Promise<void>((resolve, reject) => {
        if (provider.isSynced) {
            logger.info(`[createProjectConnection] Room ${room} already synced`);
            const treeSize = doc.getMap("orderedTree").size;
            logger.info(`[createProjectConnection] Initial tree.size=${treeSize}`);
            resolve();
            return;
        }

        const timer = setTimeout(() => {
            logger.warn(
                `[createProjectConnection] Timeout (30s) waiting for project initial sync, proceeding anyway for room: ${room}`,
            );
            const treeSize = doc.getMap("orderedTree").size;
            logger.info(`[createProjectConnection] Timeout tree.size=${treeSize}`);
            resolve();
        }, 30000);

        const syncHandler = (data?: { state?: boolean; }) => {
            logger.info(`[createProjectConnection] syncHandler: room=${room}, state=${data?.state}`);
            if (!data || data.state !== false) {
                clearTimeout(timer);
                provider.off("synced", syncHandler);
                provider.off("close", closeHandler);
                const treeSize = doc.getMap("orderedTree").size;
                logger.info(`[createProjectConnection] Sync complete for ${room}. tree.size=${treeSize}`);
                resolve();
            }
        };

        const closeHandler = (event: { code?: number; reason?: string; }) => {
            const code = event.code;
            logger.info(`[createProjectConnection] closeHandler: room=${room}, code=${code}, reason=${event.reason}`);
            if (code && [4003, 4006, 4008, 4001].includes(code)) {
                clearTimeout(timer);
                provider.off("synced", syncHandler);
                provider.off("close", closeHandler);
                logger.error(
                    `[createProjectConnection] Fatal close event ${code} received during initial sync for ${room}: ${event.reason}`,
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
    let unsub: (() => void) | undefined;
    if (projectId !== "demo") {
        unsub = attachTokenRefresh(provider as TokenRefreshableProvider);
    }

    const dispose = () => {
        try {
            unbind();
        } catch {}
        try {
            if (unsub) unsub();
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
        if (projectId !== "demo") {
            initialToken = await getFreshIdToken();
        } else {
            initialToken = "1"; // Send dummy token in URL to satisfy strict routing on older servers
        }
    } catch (e) {
        logger.error({ error: e }, "[connectProjectDoc] getFreshIdToken FAILED");
    }

    const provider = new HocuspocusProvider({
        url: constructWsUrl(wsBase, room, initialToken),
        name: room,
        document: doc,
        token: initialToken || "1", // HocuspocusProvider requires a truthy token to send the Auth message, even for unauthenticated rooms like demo.
    });
    const awareness = provider.awareness;

    provider.on(
        "status",
        (event: { status: string; }) => logger.info(`[connectProjectDoc] ${room} status: ${event.status}`),
    );
    provider.on("close", (event: { code?: number; reason?: string; }) => {
        logger.warn(
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
    if (projectId !== "demo") {
        attachTokenRefresh(provider as TokenRefreshableProvider);
    }
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
        if (projectId !== "demo") {
            initialToken = await getFreshIdToken();
        } else {
            initialToken = "1"; // Send dummy token in URL to satisfy strict routing on older servers
        }
    } catch {}

    // Send a dummy `token` for the same reason as in createProjectConnection
    const provider = new HocuspocusProvider({
        url: constructWsUrl(wsBase, room, initialToken),
        name: room,
        document: doc,
        token: initialToken || "1", // HocuspocusProvider requires a truthy token to send the Auth message, even for unauthenticated rooms like demo.
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
