// High-level Yjs service providing shared document utilities
import { SvelteMap } from "svelte/reactivity";
import { v4 as uuid } from "uuid";
import { userManager } from "../auth/UserManager";
import { Project } from "../schema/yjs-schema";
import { saveProjectIdToServer } from "../stores/firestoreStore.svelte";
import { yjsStore } from "../stores/yjsStore.svelte";
import { YjsClient } from "../yjs/YjsClient";
import { getFirebaseFunctionUrl } from "./firebaseFunctionsUrl";
import { getContainerTitleFromMetaDoc, getProjectIdByTitle, setContainerTitleInMetaDoc } from "./metaDoc.svelte";

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
        throw new Error("ユーザーがログインしていないため、新規プロジェクトを作成できません");
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
    try {
        if (!isTest) {
            console.log(
                "[yjsService] Saving project ID to server (Legacy + New):",
                projectId,
                "User:",
                userId,
                "v=DualSaveFix",
            );
            try {
                // Call both New and Legacy endpoints to ensure compatibility with all server versions
                // Note: saveContainerIdToServer is aliased to saveProjectId but connects to saveContainer in index.js?
                // Wait, Step 340 showed: export const saveContainerId = saveProjectId;
                // It aliases the FUNCTION, which calls /api/saveProject.
                // This is WRONG. I need to implement a REAL saveContainer call.
                // I cannot use saveContainerIdToServer from firestoreStore if it's just an alias.

                // I will implement raw fetch here for legacy support.
                const fnUrl = getFirebaseFunctionUrl("saveContainer");
                const idToken = await userManager.auth.currentUser?.getIdToken();

                const legacySavePromise = fetch(fnUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ idToken, containerId: projectId }),
                }).then(r => r.json()).then(d => d.success === true).catch(e => {
                    console.error("[yjsService] Legacy save failed:", e);
                    return false;
                });

                const [savedNew, savedLegacy] = await Promise.all([
                    saveProjectIdToServer(projectId),
                    legacySavePromise,
                ]);

                if (savedNew && savedLegacy) {
                    console.log("[yjsService] Project ID saved successfully (Dual Save).");
                } else if (savedNew) {
                    console.warn("[yjsService] Project ID saved to New API only.");
                } else if (savedLegacy) {
                    console.warn("[yjsService] Project ID saved to Legacy API only.");
                } else {
                    console.error("[yjsService] Failed to save project ID to both APIs.");
                    // Silent fail for user, but log error.
                }
            } catch (saveError) {
                console.error("[yjsService] Exception saving project ID:", saveError);
            }
        }
    } catch (e) {
        console.error(`[yjsService] Failed to save project ID ${projectId} to server:`, e);
        // We continue anyway, but connection might fail with Access Denied
    }

    const project = Project.createInstance(projectName);
    console.log(`[yjsService] createNewProject: Connecting to YjsClient for projectId "${projectId}"...`);
    const client = await YjsClient.connect(projectId, project);
    console.log(`[yjsService] createNewProject: YjsClient connected for projectId "${projectId}".`);
    registry.set(keyFor(userId, projectId), [client, project]);

    // Save title to metadata Y.Doc for dropdown display
    // Save project title to metadata Y.Doc for persistence across page reloads
    setContainerTitleInMetaDoc(projectId, projectName);

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
    const projectId = getProjectIdByTitle(projectTitle);
    console.log(`[getClientByProjectTitle] projectId from metaDoc=${projectId}`);

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
        let userId = user?.id || (isTestEnvironment() ? "test-user-id" : undefined);

        if (userId) {
            // Register project access before connecting (critical for WebSocket auth)
            if (!isTestEnvironment()) {
                try {
                    console.log(`[getClientByProjectTitle] Registering access for projectId=${projectId}`);
                    await saveProjectIdToServer(projectId);
                } catch (e) {
                    console.warn("[getClientByProjectTitle] Failed to register project access:", e);
                    // Continue anyway - might already be registered
                }
            }
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
    setContainerTitleInMetaDoc(resolvedId, title);

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
