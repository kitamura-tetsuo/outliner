// High-level Yjs service mirroring fluidService responsibilities
// @ts-nocheck
import { SvelteMap } from "svelte/reactivity";
import { v4 as uuid } from "uuid";
import { userManager } from "../auth/UserManager";
import { Project } from "../schema/yjs-schema";
import { yjsStore } from "../stores/yjsStore.svelte";
import { YjsClient } from "../yjs/YjsClient";
import { getLogger, log } from "./logger";

const logger = getLogger();

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
    registry = ((window as any).__YJS_CLIENT_REGISTRY__ || (window as any).__FLUID_CLIENT_REGISTRY__) as Registry;
} else {
    registry = new Registry();
    if (typeof window !== "undefined") {
        (window as any).__YJS_CLIENT_REGISTRY__ = registry;
        // Legacy alias for components still reading FLUID registry
        (window as any).__FLUID_CLIENT_REGISTRY__ = registry;
    }
}

function keyFor(userId?: string, containerId?: string): ClientKey {
    return containerId ? { type: "container", id: containerId } : { type: "user", id: userId || "anonymous" };
}

export async function createNewProject(containerName: string): Promise<YjsClient> {
    const user = userManager.getCurrentUser();
    let userId = user?.id;
    if (!userId && (import.meta.env.MODE === "test" || process.env.NODE_ENV === "test")) {
        userId = "test-user-id";
    }
    if (!userId) throw new Error("ユーザーがログインしていないため、新規プロジェクトを作成できません");

    const projectId = uuid();
    const project = Project.createInstance(containerName);
    const client = await YjsClient.connect(projectId, project);
    const k = keyFor(userId, projectId);
    registry.set(k, [client, project]);

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
    for (const [k, [client, project]] of registry.entries()) {
        if (project?.title === projectTitle && client) return client;
    }
    return undefined;
}

export async function createClient(containerId?: string): Promise<YjsClient> {
    // In Yjs-only mode, containerId is optional. We create if missing.
    const user = userManager.getCurrentUser();
    let userId = user?.id;
    if (!userId && (import.meta.env.MODE === "test" || process.env.NODE_ENV === "test")) {
        userId = "test-user-id";
    }
    const resolvedId = containerId || uuid();
    const title = typeof window !== "undefined"
        ? ((window as any).__CURRENT_PROJECT_TITLE__ ?? "Test Project")
        : "Test Project";
    const project = Project.createInstance(title);
    const client = await YjsClient.connect(resolvedId, project);
    const k = keyFor(userId, resolvedId);
    registry.set(k, [client, project]);
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
export async function deleteContainer(_containerId: string): Promise<boolean> {
    // No-op in Yjs-only mode; containers are client-local concepts here.
    return true;
}

export async function getUserContainers(): Promise<{ containers: string[]; defaultContainerId: string | null; }> {
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
