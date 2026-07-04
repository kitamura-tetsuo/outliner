import { getLogger } from "../logger";

const logger = getLogger("yjs-connection");

import { HocuspocusProvider } from "@hocuspocus/provider";
import type { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { userManager } from "../../auth/UserManager";
import { createPersistence, waitForSync } from "../yjsPersistence";
import { projectRoomPath } from "./roomPath";
import { setRoomSyncState } from "./roomSyncState";
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
            logger.debug(`[yjs-conn] ${label} sync=${data.state}`);
        });
        // awareness states count
        const logAwareness = () => {
            try {
                const states = (awareness as { getStates?: () => Map<number, unknown>; })?.getStates?.();
                const count = states?.size ?? 0;
                const tree = doc.getMap("orderedTree") as import("yjs").Map<unknown>;
                logger.debug(`[yjs-conn] ${label} awareness.states=${count} tree.size=${tree.size}`);
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
            logger.debug(`[yjs-conn] ${label} update#${updCount} bytes=${bytes}`);
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
    logger.debug(
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

async function getFreshIdToken(forceRefresh: boolean): Promise<string> {
    // Wait for auth and fetch an ID token, using Firebase's cache unless a refresh is requested
    const auth = userManager.auth;
    const isTestEnv = import.meta.env.MODE === "test"
        || (typeof window !== "undefined"
            && (window.localStorage?.getItem?.("VITE_IS_TEST") === "true"
                || window.__E2E__ === true));
    logger.debug(
        `[getFreshIdToken] isTestEnv=${isTestEnv}, auth.currentUser=${!!auth
            .currentUser}, forceRefresh=${forceRefresh}`,
    );

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
        logger.debug(`[getFreshIdToken] Fetching ID token from Firebase Auth (forceRefresh=${forceRefresh})...`);
        // Only force a refresh when explicitly requested (e.g. after an auth failure). Using the
        // SDK's cache otherwise avoids an unnecessary network round-trip on every (re)connect.
        const token = await auth.currentUser.getIdToken(forceRefresh);
        logger.debug(`[getFreshIdToken] Token fetched successfully (len=${token?.length ?? 0})`);
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
 * Constructs the WebSocket URL including only the room path.
 * The auth token is never included here: the server authenticates via the Hocuspocus
 * Auth message (see `token` in HocuspocusProviderConfiguration below), not the URL, so
 * putting it in the query string would only risk leaking it into proxy/access logs.
 */
function constructWsUrl(wsBase: string, room: string): string {
    // Ensure no double slashes when joining base and room
    const baseUrl = wsBase.replace(/\/$/, "");
    const roomPath = room.startsWith("/") ? room.slice(1) : room;
    return `${baseUrl}/${roomPath}`;
}

// Fatal close codes mean the server will never accept this connection: retrying is pointless
// and, left unchecked, HocuspocusProvider's built-in backoff will retry forever.
const FATAL_CLOSE_CODES = new Set([4001, 4003, 4006, 4008]);

async function attachIndexedDbPersistence(room: string, doc: Y.Doc): Promise<void> {
    if (typeof indexedDB === "undefined" || !isIndexedDBEnabled()) return;
    try {
        const persistence = createPersistence(room, doc);
        await waitForSync(persistence);
    } catch { /* no-op in Node */ }
}

interface ProviderSetup {
    provider: HocuspocusProvider;
    awareness: Awareness | null;
    /** Waits for the room's initial sync, rejecting on fatal close codes and resolving `{ synced: false }` on timeout. */
    waitForInitialSync: (timeoutMs?: number) => Promise<{ synced: boolean; }>;
    dispose: () => void;
}

interface SetupProviderOptions {
    /** Set the local awareness "user" field from the current user. */
    setAwarenessUser?: boolean;
    /** Bind awareness changes to the presence store. */
    bindPresence?: boolean;
    /** Re-send the auth token / reconnect when the Firebase auth state changes. */
    attachTokenRefreshHook?: boolean;
}

/**
 * Single source of truth for setting up a Hocuspocus connection for a room: persistence,
 * token acquisition/refresh, provider construction, and event wiring. Every entry point in
 * this file (createProjectConnection, connectProjectDoc, createMinimalProjectConnection)
 * delegates here so their behavior can't drift, in particular around fatal auth close codes.
 *
 * Presence binding and the token-refresh hook are opt-in (rather than always on) because
 * createMinimalProjectConnection is deliberately a bare, low-level connection used by tests;
 * pulling in the full presence/auth-refresh machinery there raced with the connection's own
 * initial handshake and made those tests time out.
 */
async function setupProviderForRoom(
    projectId: string,
    room: string,
    doc: Y.Doc,
    label: string,
    options: SetupProviderOptions = {},
): Promise<ProviderSetup> {
    const { setAwarenessUser = false, bindPresence = false, attachTokenRefreshHook = false } = options;
    const isDemo = projectId === "demo";
    let forceTokenRefresh = false;

    // HocuspocusProvider calls this function itself on every (re)connect attempt and whenever
    // sendToken() runs, so the token is always fresh without us having to patch a cached URL.
    const tokenProvider = async (): Promise<string> => {
        if (isDemo) return "1"; // dummy token: demo rooms are unauthenticated but still need a truthy value
        try {
            const token = await getFreshIdToken(forceTokenRefresh);
            forceTokenRefresh = false;
            return token || "1";
        } catch (e) {
            logger.error({ error: e }, `[${label}] getFreshIdToken failed`);
            return "1";
        }
    };

    const wsBase = getWsBase();
    const provider = new HocuspocusProvider({
        url: constructWsUrl(wsBase, room),
        name: room,
        document: doc,
        token: tokenProvider,
    });
    logger.debug(`[${label}] Provider created for ${room}, wsBase=${wsBase}`);

    provider.on("status", (event: { status: string; }) => {
        logger.debug(`[yjs-conn] ${room} status: ${event.status}`);
    });

    provider.on("close", (event: { code?: number; reason?: string; }) => {
        const code = event.code;
        const reason = event.reason;
        logger.warn(`[yjs-conn] ${room} connection-close code=${code} reason=${reason || "None"}`);

        if (code === 4001 || code === 4003) {
            logger.debug(`[yjs-conn] Auth error ${code} detected for ${room}, forcing token refresh before retry...`);
            forceTokenRefresh = true;
            void userManager.refreshToken();
        }

        if (code && FATAL_CLOSE_CODES.has(code)) {
            logger.error(`[yjs-conn] Fatal close ${code} for ${room}: stopping reconnect attempts`);
            setRoomSyncState(room, "denied");
            try {
                provider.disconnect();
            } catch {}
        }
    });

    // Detailed event logging for sync debugging
    provider.on("authenticated", () => logger.debug(`[yjs-conn] ${room} authenticated`));
    provider.on(
        "authenticationFailed",
        (data: unknown) => logger.error({ data }, `[yjs-conn] ${room} authenticationFailed`),
    );
    provider.on("stateless", (data: unknown) => logger.debug({ data }, `[yjs-conn] ${room} stateless event`));
    provider.on("reconnect", () => logger.debug(`[yjs-conn] ${room} reconnecting...`));
    provider.on("disconnect", (event: { code: number; reason: string; }) => {
        logger.debug(`[yjs-conn] ${room} disconnect code=${event.code} reason=${event.reason}`);
    });

    const awareness = provider.awareness;
    attachConnDebug(room, provider, awareness, doc);

    const current = setAwarenessUser ? userManager.getCurrentUser() : null;
    if (current && awareness) {
        awareness.setLocalStateField("user", {
            userId: current.id,
            name: current.name,
            color: undefined,
        });
    }

    const unbindPresence = bindPresence && awareness ? yjsService.bindProjectPresence(awareness) : undefined;
    const unsubTokenRefresh = attachTokenRefreshHook && !isDemo
        ? attachTokenRefresh(provider as TokenRefreshableProvider)
        : undefined;

    const waitForInitialSync = (timeoutMs = 30000): Promise<{ synced: boolean; }> => {
        return new Promise((resolve, reject) => {
            if (provider.isSynced) {
                logger.debug(`[${label}] Room ${room} already synced`);
                setRoomSyncState(room, "synced");
                resolve({ synced: true });
                return;
            }

            setRoomSyncState(room, "pending");

            const cleanup = () => {
                clearTimeout(timer);
                provider.off("synced", syncHandler);
                provider.off("close", closeHandler);
            };

            const timer = setTimeout(() => {
                logger.warn(
                    `[${label}] Timeout (${timeoutMs}ms) waiting for initial sync, proceeding anyway for room: ${room}`,
                );
                setRoomSyncState(room, "timed-out");
                cleanup();
                resolve({ synced: false });
            }, timeoutMs);

            const syncHandler = (data?: { state?: boolean; }) => {
                if (!data || data.state !== false) {
                    logger.debug(`[${label}] Sync complete for ${room}`);
                    setRoomSyncState(room, "synced");
                    cleanup();
                    resolve({ synced: true });
                }
            };

            const closeHandler = (event: { code?: number; reason?: string; }) => {
                const code = event.code;
                if (code && FATAL_CLOSE_CODES.has(code)) {
                    cleanup();
                    reject(new Error(`Access Denied: ${code}`));
                }
            };

            provider.on("synced", syncHandler);
            provider.on("close", closeHandler);
        });
    };

    const dispose = () => {
        try {
            unbindPresence?.();
        } catch {}
        try {
            unsubTokenRefresh?.();
        } catch {}
        try {
            provider.destroy();
        } catch {}
    };

    return { provider, awareness, waitForInitialSync, dispose };
}

export async function createProjectConnection(projectId: string): Promise<ProjectConnection> {
    logger.debug(`[createProjectConnection] Starting for projectId=${projectId}`);
    const doc = new Y.Doc({ guid: projectId });
    const room = projectRoomPath(projectId);

    await attachIndexedDbPersistence(room, doc);

    const { provider, awareness, waitForInitialSync, dispose: disposeProvider } = await setupProviderForRoom(
        projectId,
        room,
        doc,
        "createProjectConnection",
        { setAwarenessUser: true, bindPresence: true, attachTokenRefreshHook: true },
    );

    // Wait for initial project sync to complete (or time out) before connecting pages.
    // A timeout no longer means "pretend everything is fine": setRoomSyncState marks the
    // room as "timed-out" so callers (see yjsStore) can surface a not-yet-synced state to the UI.
    await waitForInitialSync();

    const dispose = () => {
        disposeProvider();
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
    const room = projectRoomPath(projectId);
    await attachIndexedDbPersistence(room, doc);

    const { provider, awareness } = await setupProviderForRoom(projectId, room, doc, "connectProjectDoc", {
        setAwarenessUser: true,
        attachTokenRefreshHook: true,
    });
    return { provider, awareness };
}

export async function createMinimalProjectConnection(projectId: string): Promise<{
    doc: Y.Doc;
    provider: HocuspocusProvider;
    dispose: () => void;
}> {
    const doc = new Y.Doc({ guid: projectId });
    const room = projectRoomPath(projectId);

    await attachIndexedDbPersistence(room, doc);

    const { provider, dispose: disposeProvider } = await setupProviderForRoom(
        projectId,
        room,
        doc,
        "createMinimalProjectConnection",
    );

    const dispose = () => {
        disposeProvider();
        try {
            doc.destroy();
        } catch {}
    };
    return { doc, provider, dispose };
}
