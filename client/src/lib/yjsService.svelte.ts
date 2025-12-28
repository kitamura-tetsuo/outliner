// High-level Yjs service providing shared document utilities
import { SvelteMap } from "svelte/reactivity";
import { v4 as uuid } from "uuid";
import { userManager } from "../auth/UserManager";
import { Project } from "../schema/yjs-schema";
import { yjsStore } from "../stores/yjsStore.svelte";
import { YjsClient } from "../yjs/YjsClient";
import { log } from "./logger";
import { getContainerTitleFromMetaDoc, setContainerTitleInMetaDoc } from "./metaDoc.svelte";

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
    // Check for test environment using reliable localStorage detection
    // This works in both Vite test mode and Playwright E2E tests
    if (typeof window === "undefined") return false;
    return window.localStorage?.getItem?.("VITE_IS_TEST") === "true";
}

export async function createNewProject(containerName: string): Promise<YjsClient> {
    const user = userManager.getCurrentUser();
    let userId = user?.id;
    const isTest = isTestEnvironment();

    if (!userId && isTest) userId = "test-user-id";
    if (!userId) {
        throw new Error("ユーザーがログインしていないため、新規プロジェクトを作成できません");
    }

    // In test environment, derive a stable projectId from the title so separate browsers join the same room
    function stableIdFromTitle(title: string): string {
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

    const projectId = isTest ? stableIdFromTitle(containerName) : uuid();
    console.log(
        `[yjsService] createNewProject: isTest=${isTest}, containerName="${containerName}", projectId="${projectId}"`,
    );

    const project = Project.createInstance(containerName);
    const client = await YjsClient.connect(projectId, project);
    registry.set(keyFor(userId, projectId), [client, project]);

    // Save title to metadata Y.Doc for dropdown display
    // Save container title to metadata Y.Doc for persistence across page reloads
    setContainerTitleInMetaDoc(projectId, containerName);

    // update store
    yjsStore.yjsClient = client;

    if (typeof window !== "undefined") {
        (window as any).__CURRENT_PROJECT__ = project;
        (window as any).__CURRENT_PROJECT_TITLE__ = containerName;
    }

    return client;
}

export async function getClientByProjectTitle(projectTitle: string): Promise<YjsClient | undefined> {
    log("yjsService", "info", `Get client by title: ${projectTitle}`);
    for (const [, [client, project]] of registry.entries()) {
        if (project?.title === projectTitle && client) return client;
    }
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

// Compatibility stubs for UI that previously used Fluid Functions
export async function deleteContainer(containerId: string): Promise<boolean> {
    // No-op in Yjs-only mode; containers are client-local concepts here.
    // Using containerId to satisfy function signature
    console.log(`[yjsService] deleteContainer called for: ${containerId}`);
    return true;
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
