import { getYjsClientByProjectTitle } from "../services";
import { store } from "../stores/store.svelte";
import { yjsStore } from "../stores/yjsStore.svelte";
import { initializeDemoProject, releaseDemoProject } from "./demoInit";
import { isPublicProject } from "./publicProject";

export interface RouteProjectHandle {
    /** Stable project id used by project-owned subdoc rooms. */
    projectId: string;
    /** Drops this route's reference to the project, if it holds one. */
    release: () => void;
}

/**
 * Connect the standalone table, schedule and calendar routes to their project
 * and publish it on `store.project`.
 *
 * A public demo needs the shared demo initialization rather than a bare
 * registry lookup: a visitor opening one of these URLs directly (or reloading)
 * has no demo client yet, and nothing else would issue the `POST /api/seed-demo`
 * that creates or refreshes the document. Without it `listTables()` finds no
 * template entry and the public route reports "not found". The demo client is
 * reference counted, so callers must `release()` the returned handle on destroy.
 */
export async function openRouteProject(
    projectName: string,
    isDestroyed: () => boolean,
): Promise<RouteProjectHandle | undefined> {
    if (isPublicProject(projectName)) {
        // Sets `yjsStore.yjsClient` and `store.project` itself, and seeds the
        // demo document when the template is missing or stale.
        const handle = await initializeDemoProject(projectName, { isDestroyed, waitForValidation: true });
        return { projectId: handle.client.containerId, release: () => releaseDemoProject(projectName) };
    }

    const client = await getYjsClientByProjectTitle(projectName);
    if (!client) return undefined;

    yjsStore.yjsClient = client as unknown as NonNullable<typeof yjsStore.yjsClient>;
    const projectDoc = client.getProject?.();
    if (projectDoc) {
        store.project = projectDoc as unknown as NonNullable<typeof store.project>;
    }
    return { projectId: client.containerId, release: () => {} };
}
