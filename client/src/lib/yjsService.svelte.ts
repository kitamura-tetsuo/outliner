// High-level Yjs service providing shared document utilities
import { SvelteMap } from "svelte/reactivity";
import { v4 as uuid } from "uuid";
import { userManager } from "../auth/UserManager";
import { Project } from "../schema/yjs-schema";
import { saveProjectIdToServer } from "../stores/firestoreStore.svelte";
import { yjsStore } from "../stores/yjsStore.svelte";
import { YjsClient } from "../yjs/YjsClient";
import { getFirebaseFunctionUrl } from "./firebaseFunctionsUrl";
import {
    getContainerTitleFromMetaDoc,
    getProjectIdByTitle,
    metaDocLoaded,
    setContainerTitleInMetaDoc,
} from "./metaDoc.svelte";

// Local memory cache for immediate title resolution (critical for post-creation redirect)
// eslint-disable-next-line @typescript-eslint/no-explicit-any, svelte/prefer-svelte-reactivity
const localTitleMap = new Map<string, string>();

function setProjectTitle(id: string, title: string) {
    localTitleMap.set(title, id);
    setContainerTitleInMetaDoc(id, title);
}

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
        this.map.set(this.key(k), v);
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
    && ((window as any).__YJS_CLIENT_REGISTRY__ || (window as any).__FLUID_CLIENT_REGISTRY__)
) {
    registry = ((window as any).__YJS_CLIENT_REGISTRY__
        || (window as any).__FLUID_CLIENT_REGISTRY__) as Registry;
} else {
    registry = new Registry();
    if (typeof window !== "undefined") {
        (window as any).__YJS_CLIENT_REGISTRY__ = registry;
        // Legacy alias for components still reading FLUID registry
        (window as any).__FLUID_CLIENT_REGISTRY__ = registry;
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

    // Fallback to runtime checks (for E2E tests where MODE might not be "test")
    if (typeof window !== "undefined") {
        const win = window as any;
        const ls = win.localStorage;

        const isTestLs = ls?.getItem?.("VITE_IS_TEST");
        const isE2eLs = ls?.getItem?.("VITE_E2E_TEST");
        const isE2eWin = win.__E2E__;

        // Robust check via URL params to avoid localStorage race conditions
        const urlParams = new URL(win.location.href).searchParams;
        const isTestUrl = urlParams.get("isTest") === "true";

        if (isTestLs === "true") return true;
        if (isE2eLs === "true") return true;
        if (isE2eWin === true) return true;
        if (isTestUrl === true) return true;
    }

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

    console.log(
        `[yjsService] createNewProject: isTest=${isTest}, projectName="${projectName}", projectId="${projectId}"`,
    );

    // Save project ID to server-side persistence (Firestore)
    // This is critical for the server to grant access (checkContainerAccess)
    // We MUST ensure this succeeds before attempting WebSocket connection
    let registrationSuccess = false;
    if (!isTest) {
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            console.log(
                `[yjsService] Saving project ID to server (attempt ${attempt}/${maxRetries}):`,
                projectId,
                "User:",
                userId,
            );
            try {
                // Call saveProject API
                const saved = await saveProjectIdToServer(projectId);
                if (saved) {
                    console.log(`[yjsService] Project ID saved successfully on attempt ${attempt}.`);
                    registrationSuccess = true;
                    // Wait for Firestore propagation (important for subsequent reads)
                    await new Promise(resolve => setTimeout(resolve, 500));
                    break;
                } else {
                    console.warn(`[yjsService] saveProjectIdToServer returned false on attempt ${attempt}.`);
                }
            } catch (saveError) {
                console.error(`[yjsService] Exception saving project ID (attempt ${attempt}):`, saveError);
            }

            // Wait before retry
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }

        if (!registrationSuccess) {
            console.error(
                `[yjsService] Failed to register project after ${maxRetries} attempts. WebSocket connection may fail.`,
            );
            // Throw error to notify user instead of silently failing
            throw new Error("プロジェクトの登録に失敗しました。ネットワーク接続を確認してください。");
        }
    }

    const project = Project.createInstance(projectName);
    console.log(`[yjsService] createNewProject: Connecting to YjsClient for projectId "${projectId}"...`);
    const client = await YjsClient.connect(projectId, project);
    console.log(`[yjsService] createNewProject: YjsClient connected for projectId "${projectId}".`);
    registry.set(keyFor(userId, projectId), [client, project]);

    // Save title to metadata Y.Doc for dropdown display
    // Save project title to metadata Y.Doc for persistence across page reloads
    setProjectTitle(projectId, projectName);

    // update store
    yjsStore.yjsClient = client;

    if (typeof window !== "undefined") {
        (window as any).__CURRENT_PROJECT__ = project;
        (window as any).__CURRENT_PROJECT_TITLE__ = projectName;
    }

    return client;
}

// Debug helper for E2E tests

export async function getClientByProjectTitle(projectTitle: string): Promise<YjsClient | undefined> {
    console.log(`[getClientByProjectTitle] projectTitle=${projectTitle}, registry.map.size=${registry.map.size}`);

    // First, check the registry for a matching client
    for (const [, [client, project]] of registry.entries()) {
        if (project?.title === projectTitle && client) {
            console.log(`[getClientByProjectTitle] Found existing client in registry`);
            return client;
        }
    }

    // If not in registry, try to find the projectId by title in metaDoc
    console.log(`[getClientByProjectTitle] Called for title="${projectTitle}"`);

    // 1. Check local memory cache first (fastest, handles redirect immediately after creation)
    let projectId = localTitleMap.get(projectTitle);
    if (projectId) {
        console.log(`[getClientByProjectTitle] Found in localTitleMap: ${projectId}`);
    } else {
        // 2. Wait for IndexedDB to load (handles reload)
        // Add timeout to prevent hanging if synced event never fires (e.g. in some test envs)
        const timeout = new Promise<void>(r => setTimeout(r, 1000));
        await Promise.race([metaDocLoaded, timeout]);
        // 3. Check persistent storage
        projectId = getProjectIdByTitle(projectTitle);
    }

    console.log(`[getClientByProjectTitle] projectId from resolution=${projectId}`);

    if (projectId) {
        const user = userManager.getCurrentUser();
        let userId = user?.id;
        const isTest = isTestEnvironment();
        console.log(`[getClientByProjectTitle] userId=${userId}, isTest=${isTest}`);

        if (!userId && isTest) userId = "test-user-id";
        if (!userId) {
            // Cannot create a new client without a user ID
            console.log(`[getClientByProjectTitle] No userId, returning undefined`);
            return undefined;
        }

        const project = Project.createInstance(projectTitle);
        console.log(`[getClientByProjectTitle] Calling YjsClient.connect for projectId=${projectId}`);
        const client = await YjsClient.connect(projectId, project);
        console.log(`[getClientByProjectTitle] YjsClient.connect completed`);
        registry.set(keyFor(userId, projectId), [client, project]);
        return client;
    }

    // Check if the projectTitle is actually a UUID (Direct Access)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(projectTitle)) {
        console.log(`[getClientByProjectTitle] projectTitle looks like a UUID, using as projectId: ${projectTitle}`);
        const projectId = projectTitle; // Treat title as ID
        const user = userManager.getCurrentUser();
        const userId = user?.id || (isTestEnvironment() ? "test-user-id" : undefined);

        if (userId) {
            const project = Project.createInstance(projectId);
            const client = await YjsClient.connect(projectId, project);
            registry.set(keyFor(userId, projectId), [client, project]);
            return client;
        }
    }

    // In test environment, attempt to auto-connect if we can derive the ID
    const isTest = isTestEnvironment();
    console.log(`[getClientByProjectTitle] projectId not found, isTest=${isTest}`);

    if (isTest) {
        const userId = userManager.getCurrentUser()?.id || "test-user-id";
        const projectId = stableIdFromTitle(projectTitle);
        console.log(`[getClientByProjectTitle] Using stableIdFromTitle, projectId=${projectId}`);

        // Check if already connected by ID (but title mismatch? unlikely for stable ID)
        if (registry.has(keyFor(userId, projectId))) {
            const [c] = registry.get(keyFor(userId, projectId))!;
            if (c) {
                console.log(`[getClientByProjectTitle] Found client by stable ID`);
                return c;
            }
        }

        const project = Project.createInstance(projectTitle);
        console.log(`[getClientByProjectTitle] Calling YjsClient.connect for derived projectId=${projectId}`);
        const client = await YjsClient.connect(projectId, project);
        console.log(`[getClientByProjectTitle] YjsClient.connect completed`);

        registry.set(keyFor(userId, projectId), [client, project]);
        // Also save title to persistence so next time it might appear
        setContainerTitleInMetaDoc(projectId, projectTitle);
        return client;
    }

    console.log(`[getClientByProjectTitle] Returning undefined`);
    return undefined;
}

export function getProjectTitle(containerId: string): string {
    // First, try to get the title from the loaded project in registry
    for (const [k, [, project]] of registry.entries()) {
        if (k.includes(containerId) && project?.title) {
            return project.title;
        }
    }

    // Fallback: get title from metadata Y.Doc (works for cached containers)
    const metaTitle = getContainerTitleFromMetaDoc(containerId);
    if (metaTitle) {
        return metaTitle;
    }

    // Final fallback: return empty string
    return "";
}

export async function createClient(containerId?: string): Promise<YjsClient> {
    // In Yjs-only mode, containerId is optional. We create if missing.
    const user = userManager.getCurrentUser();
    let userId = user?.id;
    const isTest = isTestEnvironment();

    if (!userId && isTest) userId = "test-user-id";
    const resolvedId = containerId || uuid();
    const title = typeof window !== "undefined"
        ? (((window as any).__CURRENT_PROJECT_TITLE__ as string | undefined) ?? "Test Project")
        : "Test Project";

    const project = Project.createInstance(title);
    const client = await YjsClient.connect(resolvedId, project);
    registry.set(keyFor(userId, resolvedId), [client, project]);

    // Save title to metadata Y.Doc for dropdown display
    setProjectTitle(resolvedId, title);

    yjsStore.yjsClient = client;
    return client;
}

export function cleanupClient() {
    try {
        yjsStore.yjsClient?.dispose();
    } catch {}
    yjsStore.yjsClient = undefined;
}

export async function deleteProject(projectId: string): Promise<boolean> {
    console.log(`[yjsService] deleteProject called for: ${projectId}`);

    const currentUser = userManager.auth.currentUser;
    if (!currentUser) {
        console.error("[yjsService] deleteProject: User not logged in");
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
            console.error(`[yjsService] deleteProject failed: ${response.status} ${response.statusText}`, errorText);
            throw new Error(`Failed to delete project: ${response.statusText}`);
        }

        const data = await response.json();
        if (data.success) {
            console.log(`[yjsService] deleteProject success for ${projectId}`);
            return true;
        } else {
            console.error(`[yjsService] deleteProject returned failure`, data);
            return false;
        }
    } catch (error) {
        console.error(`[yjsService] deleteProject exception`, error);
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

// Testing hooks
if (process.env.NODE_ENV === "test" && typeof window !== "undefined") {
    (window as any).__YJS_SERVICE__ = {
        createNewProject,
        getClientByProjectTitle,
        createClient,
        cleanupClient,
    };
}
