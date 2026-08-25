// High-level Yjs service providing shared document utilities
import { isDemoProjectSlug } from "$shared/demoProjects";
import { SvelteMap } from "svelte/reactivity";
import { v4 as uuid } from "uuid";
import { userManager } from "../auth/UserManager";
import { Project } from "../schema/yjs-schema";
import { createProjectDescriptor, resolveProject } from "../services/projectDirectoryService";
import { yjsStore } from "../stores/yjsStore.svelte";
import { YjsClient } from "../yjs/YjsClient";
import { getFirebaseFunctionUrl } from "./firebaseFunctionsUrl";
import { getLogger } from "./logger";
const logger = getLogger("yjsService");

interface ClientKey {
    type: "container" | "user";
    id: string;
}

type Instances = [YjsClient | undefined, Project | undefined];

class Registry {
    map = new SvelteMap<string, Instances>();

    key(k: ClientKey) {
        return `${k.type}:${k.id}`;
    }

    has(k: ClientKey) {
        return this.map.has(this.key(k));
    }

    get(k: ClientKey) {
        return this.map.get(this.key(k));
    }

    set(k: ClientKey, v: Instances) {
        const keyStr = this.key(k);
        const existing = this.map.get(keyStr);
        if (existing && existing[0] && existing[0] !== v[0]) {
            logger.warn(`[yjsService] Overwriting existing client in registry for ${keyStr}. Disposing loser.`);
            try {
                existing[0].dispose();
            } catch (e) {
                logger.error({ error: e as Error }, `Failed to dispose overwritten client`);
            }
        }
        this.map.set(keyStr, v);
    }

    delete(k: ClientKey) {
        this.map.delete(this.key(k));
    }

    entries() {
        return Array.from(this.map.entries());
    }

    keys() {
        return Array.from(this.map.keys());
    }
}

let registry: Registry;
if (
    typeof window !== "undefined"
    && (window.__YJS_CLIENT_REGISTRY__ || window.__FLUID_CLIENT_REGISTRY__)
) {
    registry = (window.__YJS_CLIENT_REGISTRY__
        || window.__FLUID_CLIENT_REGISTRY__) as Registry;
} else {
    registry = new Registry();
    // The literal MODE comparison lets Rollup drop this assignment from the
    // production bundle (see ENV-production-build-leak.test.ts).
    if (typeof window !== "undefined" && import.meta.env.MODE !== "production") {
        window.__YJS_CLIENT_REGISTRY__ = registry;
        // Legacy alias for components still reading FLUID registry
        window.__FLUID_CLIENT_REGISTRY__ = registry;
    }
}

function keyFor(userId?: string, containerId?: string): ClientKey {
    return containerId
        ? { type: "container", id: containerId }
        : { type: "user", id: userId || "anonymous" };
}

function isTestEnvironment(): boolean {
    let mode = "unknown";
    if (typeof import.meta !== "undefined" && import.meta.env) {
        mode = import.meta.env.MODE;
    }

    // Check for test environment using reliable detection
    if (mode === "test") {
        return true;
    }

    // Explicitly removed fallback to runtime checks for security.
    return false;
}

// In test environment, derive a stable projectId from the title so separate browsers join the same room
export function stableIdFromTitle(title: string): string {
    try {
        let h = 2166136261 >>> 0; // FNV-1a basis
        for (let i = 0; i < title.length; i++) {
            h ^= title.charCodeAt(i);
            h = (h * 16777619) >>> 0;
        }
        const hex = h.toString(16);
        return `p${hex}`; // ensure starts with a letter; matches [A-Za-z0-9_-]+
    } catch {
        return `p${Math.random().toString(16).slice(2)}`;
    }
}

export async function createNewProject(projectName: string, existingProjectId?: string): Promise<YjsClient> {
    const user = userManager.getCurrentUser();
    let userId = user?.id;
    const isTest = isTestEnvironment();

    if (!userId && isTest) userId = "test-user-id";
    if (!userId) {
        throw new Error("Cannot create a new project because the user is not logged in");
    }

    // Use provided ID or generate new ones (stable for test, random for prod)
    let projectId: string;
    if (existingProjectId) {
        projectId = existingProjectId;
    } else {
        projectId = isTest ? stableIdFromTitle(projectName) : uuid();
    }

    logger.info(
        `[yjsService] createNewProject: isTest=${isTest}, projectName="${projectName}", projectId="${projectId}"`,
    );

    // Save project ID to server-side persistence (Firestore)
    // This is critical for the server to grant access (checkContainerAccess)
    // We MUST ensure this succeeds before attempting WebSocket connection
    let registrationSuccess = false;
    if (!isTest) {
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            logger.info(
                { projectId, userId },
                `[yjsService] Saving project ID to server (attempt ${attempt}/${maxRetries})`,
            );
            try {
                // Call saveProject API
                const saved = await createProjectDescriptor(projectId, projectName);
                if (saved) {
                    logger.info(`[yjsService] Project ID saved successfully on attempt ${attempt}.`);
                    registrationSuccess = true;
                    // Wait for Firestore propagation (important for subsequent reads)
                    await new Promise(resolve => setTimeout(resolve, 500));
                    break;
                } else {
                    logger.warn(
                        `[yjsService] project directory registration returned no descriptor on attempt ${attempt}.`,
                    );
                }
            } catch (saveError) {
                logger.error({ error: saveError }, `[yjsService] Exception saving project ID (attempt ${attempt})`);
            }

            // Wait before retry
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }

        if (!registrationSuccess) {
            throw new Error(`Failed to register project ${projectId}`);
        }
    }

    const project = Project.createInstance(projectName);
    logger.info(`[yjsService] createNewProject: Connecting to YjsClient for projectId "${projectId}"...`);
    const client = await YjsClient.connect(projectId, project);
    logger.info(`[yjsService] createNewProject: YjsClient connected for projectId "${projectId}".`);
    registry.set(keyFor(userId, projectId), [client, project]);

    // update store
    yjsStore.yjsClient = client;

    if (typeof window !== "undefined") {
        const win = window as Window & typeof globalThis;
        win.__CURRENT_PROJECT__ = project as unknown as import("../schema/app-schema").Project;
        win.__CURRENT_PROJECT_TITLE__ = projectName;
    }

    return client;
}

// Debug helper for E2E tests

/* eslint-disable svelte/prefer-svelte-reactivity -- Module-level promise cache, not reactive state */
const inFlight = new Map<string, Promise<YjsClient | undefined>>();
/* eslint-enable svelte/prefer-svelte-reactivity */

export function getClientByProjectTitle(projectTitle: string, signal?: AbortSignal): Promise<YjsClient | undefined> {
    const existing = inFlight.get(projectTitle);
    if (existing) return existing;
    const p = resolveClientByProjectTitle(projectTitle, signal).finally(() => inFlight.delete(projectTitle));
    inFlight.set(projectTitle, p);
    return p;
}

export interface AcquiredProjectClient {
    client: YjsClient;
    /** Disposes the connection only when this acquisition is the one that opened it. */
    release: () => void;
}

/**
 * Open an existing project by its authoritative room id for a short visit,
 * such as reading a Grid's rows while pasting it into another project. Access
 * stays enforced by the room rather than by whoever names the id.
 *
 * A project that is already registered is shared rather than reopened, and
 * `release()` then leaves it alone: only the acquisition that opened the
 * connection is allowed to close it.
 */
export async function acquireClientByProjectId(
    projectId: string,
    signal?: AbortSignal,
): Promise<AcquiredProjectClient | undefined> {
    if (signal?.aborted) return undefined;
    let userId = userManager.getCurrentUser()?.id;
    if (!userId && isTestEnvironment()) userId = "test-user-id";
    if (!userId) return undefined;

    const key = keyFor(userId, projectId);
    const existing = registry.get(key)?.[0];
    if (existing && !existing.isDestroyed) return { client: existing, release: () => {} };
    if (existing?.isDestroyed) registry.delete(key);
    if (signal?.aborted) return undefined;

    try {
        const client = await connectAndRegister(projectId, "", userId);
        return {
            client,
            release: () => {
                try {
                    client.dispose();
                } catch (error) {
                    logger.error(error);
                }
                registry.delete(key);
            },
        };
    } catch (error) {
        logger.warn({ error, projectId }, "[acquireClientByProjectId] Source project is unavailable");
        return undefined;
    }
}

async function connectAndRegister(projectId: string, title: string, userId: string): Promise<YjsClient> {
    const project = Project.createInstance(title);
    logger.info(`[connectAndRegister] Calling YjsClient.connect for projectId=${projectId}`);
    const client = await YjsClient.connect(projectId, project);
    logger.info(`[connectAndRegister] YjsClient.connect completed`);
    registry.set(keyFor(userId, projectId), [client, project]);

    return client;
}

async function resolveProjectId(projectTitle: string): Promise<string | undefined> {
    const isTest = isTestEnvironment();
    if (isTest) {
        // Check if the title is actually a test ID format (e.g. "pa4cc30c")
        // This handles the case where we navigate to /projectId directly in tests
        if (/^p[0-9a-f]+$/i.test(projectTitle)) {
            logger.info(`[resolveProjectId] projectTitle looks like a test ID, using as projectId: ${projectTitle}`);
            return projectTitle;
        }

        const stableId = stableIdFromTitle(projectTitle);
        logger.info(`[resolveProjectId] Using stableIdFromTitle, projectId=${stableId}`);
        return stableId;
    }

    return (await resolveProject(projectTitle))?.projectId;
}

async function resolveClientByProjectTitle(projectTitle: string, signal?: AbortSignal): Promise<YjsClient | undefined> {
    logger.info(`[getClientByProjectTitle] projectTitle=${projectTitle}, registry.map.size=${registry.map.size}`);

    if (signal?.aborted) return undefined;

    // Special bypass for the public demo projects.
    //
    // This is what keeps a demo's room id equal to its title: it skips the
    // stableIdFromTitle hashing every other project goes through, so `demo-ja`
    // connects to `projects/demo-ja` and its internal links resolve to
    // /demo-ja/<page>. See shared/src/demoProjects.ts.
    if (isDemoProjectSlug(projectTitle)) {
        const userId = userManager.getCurrentUser()?.id || "anonymous-demo";
        const projectId = projectTitle;

        if (registry.has(keyFor(userId, projectId))) {
            const [c] = registry.get(keyFor(userId, projectId))!;
            if (c && !c.isDestroyed) {
                return c;
            } else if (c && c.isDestroyed) {
                logger.info(`[getClientByProjectTitle] found disposed demo client in registry; evicting it`);
                registry.delete(keyFor(userId, projectId));
            }
        }
        if (signal?.aborted) return undefined;

        return await connectAndRegister(projectId, projectTitle, userId);
    }

    // First, check the registry for a matching client
    for (const [key, [client, project]] of registry.entries()) {
        if (project?.title === projectTitle && client) {
            if (!client.isDestroyed) {
                logger.info(`[getClientByProjectTitle] Found existing client in registry`);
                return client;
            } else {
                logger.info(`[getClientByProjectTitle] Found disposed client in registry; evicting it`);
                const [type, id] = key.split(":");
                registry.delete({ type: type as "container" | "user", id });
            }
        }
    }

    if (signal?.aborted) return undefined;

    // If not in registry, try to find the projectId by title
    logger.info(`[getClientByProjectTitle] Called for title="${projectTitle}"`);

    const projectId = await resolveProjectId(projectTitle);

    logger.info(`[getClientByProjectTitle] projectId from resolution=${projectId}`);
    if (signal?.aborted) return undefined;

    if (projectId) {
        let userId = userManager.getCurrentUser()?.id;
        const isTest = isTestEnvironment();

        if (!userId && isTest) userId = "test-user-id";
        if (!userId) {
            // Cannot create a new client without a user ID
            logger.info(`[getClientByProjectTitle] No userId, returning undefined`);
            return undefined;
        }

        // Handle placeholder title for test ids or UUIDs so they don't get saved as title
        let resolvedTitle = projectTitle;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(projectTitle)) {
            // Do not seed the placeholder title with the raw UUID: YjsClient.connect()
            // persists a non-empty title into the real document's metadata when none
            // is set yet, which would permanently bake the UUID in as the project title.
            resolvedTitle = "";
        } else if (isTest && /^p[0-9a-f]+$/i.test(projectTitle)) {
            resolvedTitle = projectTitle;
        } else if (isTest) {
            // Check if already connected by ID (but title mismatch? unlikely for stable ID)
            if (registry.has(keyFor(userId, projectId))) {
                const [c] = registry.get(keyFor(userId, projectId))!;
                if (c && !c.isDestroyed) {
                    logger.info(`[getClientByProjectTitle] Found client by stable ID`);
                    return c;
                }
            }
        }

        return await connectAndRegister(projectId, resolvedTitle, userId);
    }

    logger.info(`[getClientByProjectTitle] Returning undefined`);
    return undefined;
}

export function getProjectTitle(containerId: string): string {
    // First, try to get the title from the loaded project in registry by exact key match
    const entry = registry.get({ type: "container", id: containerId })
        ?? registry.get({ type: "user", id: containerId });
    if (entry?.[1]?.title) {
        return entry[1].title;
    }

    // Final fallback: return empty string
    return "";
}

/* eslint-disable svelte/prefer-svelte-reactivity -- Module-level promise cache, not reactive state */
const inFlightCreate = new Map<string, Promise<YjsClient>>();
/* eslint-enable svelte/prefer-svelte-reactivity */

export function createClient(containerId?: string): Promise<YjsClient> {
    const key = containerId || "new";
    const existing = inFlightCreate.get(key);
    if (existing) return existing;
    const p = resolveCreateClient(containerId).finally(() => inFlightCreate.delete(key));
    inFlightCreate.set(key, p);
    return p;
}

async function resolveCreateClient(containerId?: string): Promise<YjsClient> {
    // In Yjs-only mode, containerId is optional. We create if missing.
    const user = userManager.getCurrentUser();
    let userId = user?.id;
    const isTest = isTestEnvironment();

    if (!userId && isTest) userId = "test-user-id";
    const resolvedId = containerId || uuid();
    const title = typeof window !== "undefined"
        ? ((window.__CURRENT_PROJECT_TITLE__ as string | undefined) ?? "Test Project")
        : "Test Project";

    const project = Project.createInstance(title);
    const client = await YjsClient.connect(resolvedId, project);
    registry.set(keyFor(userId, resolvedId), [client, project]);

    yjsStore.yjsClient = client;
    return client;
}

export function cleanupClient() {
    try {
        yjsStore.yjsClient?.dispose();
    } catch (_e) {
        logger.error(_e);
    }
    yjsStore.yjsClient = undefined;
}

/**
 * Dispose the registered client for a project and drop it from the registry,
 * so the next getClientByProjectTitle() call creates a fresh connection.
 * Used by the demo manual reset to re-sync after the server reseeds the doc.
 */
export function removeClientByProjectId(projectId: string): void {
    const userId = userManager.getCurrentUser()?.id
        || (isDemoProjectSlug(projectId) ? "anonymous-demo" : undefined);
    const key = keyFor(userId, projectId);
    const entry = registry.get(key);
    if (entry) {
        try {
            entry[0]?.dispose();
        } catch (_e) {
            logger.error(_e);
        }
        registry.delete(key);
    }
}

// Reference counts and in-flight connections, per demo project: the demo ships
// one project per locale, and a visitor moving between them must not have one
// locale's routes release the other's client.
/* eslint-disable svelte/prefer-svelte-reactivity -- Plain bookkeeping: no UI reads these. */
const demoRefCounts = new Map<string, number>();
const demoAcquirePromises = new Map<string, Promise<YjsClient | undefined>>();
/* eslint-enable svelte/prefer-svelte-reactivity */

export async function acquireDemoClient(
    project: string,
    signal?: AbortSignal,
): Promise<YjsClient | undefined> {
    let promise = demoAcquirePromises.get(project);
    if ((demoRefCounts.get(project) ?? 0) === 0 || !promise) {
        promise = getClientByProjectTitle(project, signal);
        demoAcquirePromises.set(project, promise);
    }
    const client = await promise;
    if (client && !signal?.aborted) {
        demoRefCounts.set(project, (demoRefCounts.get(project) ?? 0) + 1);
    }
    return client;
}

export function releaseDemoClient(project: string): number {
    const next = Math.max(0, (demoRefCounts.get(project) ?? 0) - 1);
    demoRefCounts.set(project, next);
    if (next === 0) {
        demoAcquirePromises.delete(project);
    }
    return next;
}

/** Reset one demo project's state, or every project when `project` is omitted. */
export function resetDemoClientState(project?: string): void {
    if (project === undefined) {
        demoRefCounts.clear();
        demoAcquirePromises.clear();
        return;
    }
    demoRefCounts.delete(project);
    demoAcquirePromises.delete(project);
}

export async function deleteProject(projectId: string): Promise<boolean> {
    logger.info(`[yjsService] deleteProject called for: ${projectId}`);

    const currentUser = userManager.auth.currentUser;
    if (!currentUser) {
        logger.error("[yjsService] deleteProject: User not logged in");
        throw new Error("User not logged in");
    }

    try {
        const idToken = await currentUser.getIdToken();
        const url = getFirebaseFunctionUrl("deleteProject");

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                idToken,
                projectId,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error({ errorText }, `[yjsService] deleteProject failed: ${response.status} ${response.statusText}`);
            throw new Error(`Failed to delete project: ${response.statusText}`);
        }

        const data = await response.json();
        if (data.success) {
            logger.info(`[yjsService] deleteProject success for ${projectId}`);
            return true;
        } else {
            logger.error({ data }, `[yjsService] deleteProject returned failure`);
            return false;
        }
    } catch (error) {
        logger.error({ error }, `[yjsService] deleteProject exception`);
        throw error;
    }
}

export async function getUserContainers(): Promise<{
    containers: string[];
    defaultContainerId: string | null;
}> {
    // Yjs-only mode does not manage server-side containers.
    return { containers: [], defaultContainerId: null };
}

/**
 * Reconnects the currently active project by cleanly destroying the old client
 * and creating a new one. This handles recovery from fatal connection errors.
 */
export async function reconnectProject(): Promise<void> {
    const projectId = yjsStore.getCurrentProjectId();
    if (!projectId) return;

    logger.info(`[reconnectProject] Starting manual reconnection for projectId=${projectId}`);

    const title = getProjectTitle(projectId);

    // Clear the error state in UI while reconnecting
    try {
        const { setRoomSyncState } = await import("./yjs/roomSyncState");
        const { projectRoomPath } = await import("./yjs/roomPath");
        setRoomSyncState(projectRoomPath(projectId), "pending");
    } catch (_e) {
        logger.error(_e);
    }

    removeClientByProjectId(projectId);

    const client = await getClientByProjectTitle(title || projectId);
    if (client) {
        yjsStore.yjsClient = client;
    }
}

// Testing hooks
if (process.env.NODE_ENV === "test" && typeof window !== "undefined") {
    window.__YJS_SERVICE__ = {
        createNewProject,
        getClientByProjectTitle,
        createClient,
        cleanupClient,
    };
}
