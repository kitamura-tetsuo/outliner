import { getLogger } from "../logger";

const logger = getLogger("yjs-connection");

import { HocuspocusProvider } from "@hocuspocus/provider";
import { IndexeddbPersistence } from "y-indexeddb";
import type { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { userManager } from "../../auth/UserManager";
import { createPersistence, waitForSync } from "../yjsPersistence";
import { projectRoomPath, tableRoomPath } from "./roomPath";
import { deleteRoomSyncState, setRoomSyncState } from "./roomSyncState";
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

export type ProjectConnection = {
    doc: Y.Doc;
    provider: HocuspocusProvider;
    awareness: Awareness | null;
    dispose: () => Promise<void>;
};

function getWsBase(): string {
    let port = 7093;
    try {
        if (import.meta.env.VITE_YJS_PORT) port = Number(import.meta.env.VITE_YJS_PORT);
        // Runtime override for E2E tests
        if (isConnDebugEnabled() && typeof window !== "undefined") {
            const override = window.localStorage?.getItem?.("VITE_YJS_PORT");
            if (override) {
                port = Number(override);
                // If explicit port check in localStorage, use it and ignore env WS_URL (overrides file-based env)
                return `ws://localhost:${port}`;
            }
        }
    } catch {}
    logger.debug(
        `[yjs-conn] WS Port determination: env=${import.meta.env.VITE_YJS_PORT}, ls=${
            (isConnDebugEnabled() && typeof window !== "undefined")
                ? window.localStorage?.getItem("VITE_YJS_PORT")
                : "N/A"
        }, final=${port}`,
    );
    const url = import.meta.env.VITE_YJS_WS_URL || `ws://localhost:${port}`;
    return url as string;
}

function isAuthRequired(): boolean {
    try {
        const envReq = String(import.meta.env.VITE_YJS_REQUIRE_AUTH || "") === "true";
        if (isConnDebugEnabled() && typeof window !== "undefined") {
            const lsVal = window.localStorage?.getItem?.("VITE_YJS_REQUIRE_AUTH");
            if (lsVal === "false") return false;
            if (lsVal === "true") return true;
        }
        return envReq;
    } catch {
        return false;
    }
}

async function getFreshIdToken(forceRefresh: boolean): Promise<string> {
    // Wait for auth and fetch an ID token, using Firebase's cache unless a refresh is requested
    const auth = userManager.auth;
    const isTestEnv = import.meta.env.MODE === "test";
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

    // Wait for auth to hydrate (e.g., on a cold load before Firebase restores the session).
    // This is reached only for non-demo rooms, which always require auth.
    if (!auth.currentUser) {
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

// Permanent close codes mean the server will never accept this connection: retrying is pointless
// and, left unchecked, HocuspocusProvider's built-in backoff will retry forever.
// Note: 4001 is handled separately in the code below to allow for a single retry.
const PERMANENT_CLOSE_CODES = new Set([4001, 4003, 4005]);
// Retryable close codes mean the server rejected this connection due to transient conditions,
// so we should keep HocuspocusProvider's built-in backoff.
const RETRYABLE_CLOSE_CODES = new Set([4004, 4006, 4008]);

async function attachIndexedDbPersistence(room: string, doc: Y.Doc): Promise<IndexeddbPersistence | undefined> {
    if (typeof indexedDB === "undefined") return undefined;
    let persistence: IndexeddbPersistence | undefined;
    try {
        persistence = createPersistence(room, doc);
        await waitForSync(persistence);
        return persistence;
    } catch (e) {
        logger.warn(`[yjs-connection] Failed to attach IndexedDB persistence for room ${room}:`, e);
        if (persistence) {
            persistence.destroy();
        }
        return undefined;
    }
}

interface ProviderSetup {
    provider: HocuspocusProvider;
    awareness: Awareness | null;
    /** Waits for the room's initial sync, rejecting on fatal close codes and resolving `{ synced: false }` on timeout. */
    waitForInitialSync: (timeoutMs?: number) => Promise<{ synced: boolean; }>;
    dispose: () => Promise<void>;
}

interface SetupProviderOptions {
    /** Set the local awareness "user" field from the current user. */
    setAwarenessUser?: boolean;
    /** Bind awareness changes to the presence store. */
    bindPresence?: boolean;
    /** Re-send the auth token / reconnect when the Firebase auth state changes. */
    attachTokenRefreshHook?: boolean;
    /** Persistence instance to dispose along with the provider. */
    persistence?: IndexeddbPersistence;
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
    let authRetries = 0;
    const MAX_AUTH_RETRIES = 1;
    let isRetryingCurrentClose = false;

    // HocuspocusProvider calls this function itself on every (re)connect attempt and whenever
    // sendToken() runs, so the token is always fresh without us having to patch a cached URL.
    const tokenProvider = async (): Promise<string> => {
        if (isDemo) return "1"; // dummy token: demo rooms are unauthenticated but still need a truthy value

        const MAX_TOKEN_RETRIES = 3;
        let lastError: unknown;

        for (let attempt = 1; attempt <= MAX_TOKEN_RETRIES; attempt++) {
            try {
                const token = await getFreshIdToken(forceTokenRefresh);
                forceTokenRefresh = false;
                if (!token) {
                    throw new Error("getFreshIdToken returned an empty token for a non-demo room");
                }
                return token;
            } catch (e) {
                lastError = e;
                logger.error(
                    { error: e },
                    `[${label}] getFreshIdToken failed (attempt ${attempt}/${MAX_TOKEN_RETRIES})`,
                );
                if (attempt < MAX_TOKEN_RETRIES) {
                    // Exponential backoff: 1s, 2s
                    await new Promise(resolve => setTimeout(resolve, attempt * 1000));
                }
            }
        }

        throw lastError || new Error("Failed to get token");
    };

    const wsBase = getWsBase();
    const provider = new HocuspocusProvider({
        url: constructWsUrl(wsBase, room),
        name: room,
        document: doc,
        token: tokenProvider,
    });
    logger.debug(`[${label}] Provider created for ${room}, wsBase=${wsBase}`);
    setRoomSyncState(room, "pending");

    provider.on("status", (event: { status: string; }) => {
        logger.debug(`[yjs-conn] ${room} status: ${event.status}`);
    });

    provider.on("close", (event: { code?: number; reason?: string; }) => {
        const code = event.code;
        const reason = event.reason;
        // code=undefined means a client-side close (page navigation, intentional
        // disconnect) rather than a server-side error: keep it out of the console.
        if (code === undefined) {
            logger.debug(`[yjs-conn] ${room} connection-close code=${code} reason=${reason || "None"}`);
        } else {
            logger.warn(`[yjs-conn] ${room} connection-close code=${code} reason=${reason || "None"}`);
        }

        isRetryingCurrentClose = false;

        if (code === 4001 && authRetries < MAX_AUTH_RETRIES) {
            logger.debug(
                `[yjs-conn] Auth error 4001 detected for ${room}, forcing token refresh and retrying (${
                    authRetries + 1
                }/${MAX_AUTH_RETRIES})...`,
            );
            authRetries++;
            forceTokenRefresh = true;
            isRetryingCurrentClose = true;
            void (async () => {
                try {
                    await userManager.refreshToken();
                } catch (e) {
                    logger.error({ error: e }, `[yjs-conn] 4001 refresh token failed for ${room}`);
                }
                provider.connect();
            })();
            return;
        }

        if (code === 4003) {
            logger.debug(`[yjs-conn] Auth error 4003 detected for ${room}, forcing token refresh before failing...`);
            forceTokenRefresh = true;
            void (async () => {
                try {
                    await userManager.refreshToken();
                } catch (e) {
                    logger.error({ error: e }, `[yjs-conn] 4003 refresh token failed for ${room}`);
                }
            })();
        }

        if (code && PERMANENT_CLOSE_CODES.has(code)) {
            logger.error(`[yjs-conn] Permanent close ${code} for ${room}: stopping reconnect attempts`);
            let syncState: import("./roomSyncState").RoomSyncState = "denied";
            if (code === 4005) syncState = "too-large";
            setRoomSyncState(room, syncState);
            try {
                provider.disconnect();
            } catch {}
        } else if (code && RETRYABLE_CLOSE_CODES.has(code)) {
            logger.warn(`[yjs-conn] Transient close ${code} for ${room}: will retry via backoff`);
            let syncState: import("./roomSyncState").RoomSyncState = "retrying";
            if (code === 4004) syncState = "rate-limited";
            setRoomSyncState(room, syncState);
        }
    });

    // Detailed event logging for sync debugging
    provider.on("authenticated", () => logger.debug(`[yjs-conn] ${room} authenticated`));
    provider.on(
        "authenticationFailed",
        (data: unknown) => {
            logger.error({ data }, `[yjs-conn] ${room} authenticationFailed`);
            setRoomSyncState(room, "denied");
            try {
                provider.disconnect();
            } catch {}
        },
    );
    provider.on("stateless", (data: unknown) => {
        if (typeof data === "string") {
            try {
                const parsed = JSON.parse(data);
                if (parsed && parsed.error === "MESSAGE_TOO_LARGE") {
                    logger.error(
                        { data: parsed },
                        `[yjs-conn] ${room} stateless error: MESSAGE_TOO_LARGE limit=${parsed.limit}`,
                    );
                    return;
                }
            } catch {
                // Not JSON or parse failed
            }
        }
        logger.debug({ data }, `[yjs-conn] ${room} stateless event`);
    });
    provider.on("reconnect", () => logger.debug(`[yjs-conn] ${room} reconnecting...`));
    provider.on("disconnect", (event: { code: number; reason: string; }) => {
        logger.debug(`[yjs-conn] ${room} disconnect code=${event.code} reason=${event.reason}`);
    });

    const awareness = provider.awareness;
    attachConnDebug(room, provider, awareness, doc);

    if (setAwarenessUser && awareness) {
        const current = userManager.getCurrentUser();
        if (current) {
            awareness.setLocalStateField("user", {
                userId: current.id,
                name: current.name,
                color: undefined,
            });
        } else {
            let anonId = "anon-"
                + (awareness as import("y-protocols/awareness").Awareness & { clientID: number; }).clientID;
            try {
                if (typeof window !== "undefined" && window.sessionStorage) {
                    const stored = window.sessionStorage.getItem("outliner_guest_id");
                    if (stored) {
                        anonId = stored;
                    } else {
                        anonId = "anon-" + Math.random().toString(36).substring(2, 10);
                        window.sessionStorage.setItem("outliner_guest_id", anonId);
                    }
                }
            } catch {
                // ignore
            }
            awareness.setLocalStateField("user", {
                userId: anonId,
                name: "Guest",
                color: undefined,
            });
        }
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
                if (isRetryingCurrentClose) return;
                const code = event.code;
                if (code && PERMANENT_CLOSE_CODES.has(code)) {
                    cleanup();
                    reject(new Error(`Access Denied: ${code}`));
                }
            };

            provider.on("synced", syncHandler);
            provider.on("close", closeHandler);
        });
    };

    const dispose = async () => {
        try {
            unbindPresence?.();
        } catch {}
        try {
            unsubTokenRefresh?.();
        } catch {}
        try {
            provider.destroy();
        } catch {}
        if (options.persistence) {
            try {
                await options.persistence.destroy();
            } catch {}
        }
        deleteRoomSyncState(room);
    };

    return { provider, awareness, waitForInitialSync, dispose };
}

export async function createProjectConnection(projectId: string): Promise<ProjectConnection> {
    logger.debug(`[createProjectConnection] Starting for projectId=${projectId}`);
    const doc = new Y.Doc({ guid: projectId });
    const room = projectRoomPath(projectId);

    const persistence = await attachIndexedDbPersistence(room, doc);

    const { provider, awareness, waitForInitialSync, dispose: disposeProvider } = await setupProviderForRoom(
        projectId,
        room,
        doc,
        "createProjectConnection",
        { setAwarenessUser: true, bindPresence: true, attachTokenRefreshHook: true, persistence },
    );

    // Wait for initial project sync to complete (or time out) before connecting pages.
    // A timeout no longer means "pretend everything is fine": setRoomSyncState marks the
    // room as "timed-out" so callers (see yjsStore) can surface a not-yet-synced state to the UI.
    try {
        await waitForInitialSync();
    } catch (e) {
        await disposeProvider();
        try {
            doc.destroy();
        } catch {}
        throw e;
    }

    const dispose = async () => {
        await disposeProvider();
        try {
            doc.destroy();
        } catch {}
    };

    return { doc, provider, awareness, dispose };
}

export async function connectProjectDoc(doc: Y.Doc, projectId: string): Promise<{
    provider: HocuspocusProvider;
    awareness: Awareness | null;
    dispose: () => Promise<void>;
}> {
    const room = projectRoomPath(projectId);
    const persistence = await attachIndexedDbPersistence(room, doc);

    const { provider, awareness, dispose } = await setupProviderForRoom(projectId, room, doc, "connectProjectDoc", {
        setAwarenessUser: true,
        attachTokenRefreshHook: true,
        persistence,
    });
    return { provider, awareness, dispose };
}

/**
 * Connect a table subdoc (one Y.Doc per table) to its own room. Access is
 * granted server-side based on the parent project id. Presence binding is
 * intentionally omitted: the project connection already carries awareness.
 */
export async function connectTableDoc(projectId: string, tableId: string, doc: Y.Doc): Promise<{
    provider: HocuspocusProvider;
    waitForInitialSync: (timeoutMs?: number) => Promise<{ synced: boolean; }>;
    dispose: () => Promise<void>;
}> {
    const room = tableRoomPath(projectId, tableId);
    const persistence = await attachIndexedDbPersistence(room, doc);

    const { provider, waitForInitialSync: originalWaitForInitialSync, dispose } = await setupProviderForRoom(
        projectId,
        room,
        doc,
        "connectTableDoc",
        { attachTokenRefreshHook: true, persistence },
    );

    const waitForInitialSync = async (timeoutMs?: number) => {
        try {
            return await originalWaitForInitialSync(timeoutMs);
        } catch (e) {
            await dispose();
            throw e;
        }
    };

    return { provider, waitForInitialSync, dispose };
}

export async function createMinimalProjectConnection(projectId: string): Promise<{
    doc: Y.Doc;
    provider: HocuspocusProvider;
    dispose: () => Promise<void>;
}> {
    const doc = new Y.Doc({ guid: projectId });
    const room = projectRoomPath(projectId);

    const persistence = await attachIndexedDbPersistence(room, doc);

    const { provider, dispose: disposeProvider } = await setupProviderForRoom(
        projectId,
        room,
        doc,
        "createMinimalProjectConnection",
        { persistence },
    );

    const dispose = async () => {
        await disposeProvider();
        try {
            doc.destroy();
        } catch {}
    };
    return { doc, provider, dispose };
}
