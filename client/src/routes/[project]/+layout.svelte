<script lang="ts">
    import { getLogger } from "$lib/logger";
    const logger = getLogger("Route");
import { onMount } from "svelte";
import { goto } from "$app/navigation";
    import { resolve } from "$app/paths";
import { userManager } from "../../auth/UserManager";
import { getAuthorizedClientByProjectTitle } from "../../lib/yjsService.svelte";
import { yjsStore } from "../../stores/yjsStore.svelte";
import { store } from "../../stores/store.svelte";

// Project-level layout
// This layout applies to both /[project] and /[project]/[page]
let { data, children } = $props();

import type { Project as AppProject } from "../../schema/app-schema";
import type { Project as YjsProject } from "../../schema/yjs-schema";
type Project = AppProject | YjsProject;
import type { YjsClient } from "../../yjs/YjsClient";

let project: Project | null = $state(null);
let loadGeneration = 0;
let loadController: AbortController | undefined;

// Retrieve project from the store
$effect(() => {
    if (yjsStore.yjsClient) {
        project = yjsStore.yjsClient.getProject();
    }
});

// Retrieve project name from URL parameters
$effect(() => {
    const projectParam = (data as { project?: string })?.project;
    if (!projectParam) return;

    if (!yjsStore.yjsClient) {
        loadProject(projectParam);
    }
});

async function loadProject(projectNameFromParam?: string) {
    const generation = ++loadGeneration;
    loadController?.abort();
    const controller = new AbortController();
    loadController = controller;
    try {
        const projectName = projectNameFromParam ?? (data as { project: string }).project;

        // Retrieve Yjs client from project name
        const client = await getAuthorizedClientByProjectTitle(projectName, controller.signal);

        if (generation !== loadGeneration || controller.signal.aborted || !userManager.getCurrentUser()) return;

        if (client) {
            yjsStore.yjsClient = client as YjsClient;
            project = client.getProject();
            // expose project to the global store so pages become available immediately
            store.project = project as unknown as AppProject;
        }
    } catch (err) {
        logger.error({ error: err }, "Failed to load project:");
    }
}

onMount(() => {
    // Keep auth state in sync
    try {
        const unsub = userManager.addEventListener(authResult => {
            if (!authResult) {
                ++loadGeneration;
                loadController?.abort();
                loadController = undefined;
                project = null;
                store.project = undefined;
                return;
            }
            // If project not yet loaded but param exists, try again when auth flips
            const projectParam = (data as { project?: string })?.project;
            if (projectParam && !yjsStore.yjsClient) {
                loadProject(projectParam);
            }
        });
        return () => {
            ++loadGeneration;
            loadController?.abort();
            unsub();
        };
    } catch (_e) { logger.error(_e); }
});
</script>

<div class="main-content">
    {@render children()}
</div>

<style>
.main-content {
    padding-top: 5rem; /* Padding for toolbar height (allowing 5rem) */
}
</style>
