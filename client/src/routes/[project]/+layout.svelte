<script lang="ts">
import { onMount } from "svelte";
import { page as pageStore } from "$app/stores";
import { userManager } from "../../auth/UserManager";
import { getYjsClientByProjectTitle } from "../../services";
import { yjsStore } from "../../stores/yjsStore.svelte";
import { store } from "../../stores/store.svelte";

// Project level layout
// This layout applies to both /[project] and /[project]/[page]
let { data, children } = $props();

let project: any = $state(null);

// Get project from store
$effect(() => {
    if (yjsStore.yjsClient) {
        project = yjsStore.yjsClient.getProject();
    }
});

// Get project name from URL parameter
$effect(() => {
    // Prefer explicit param over optional data prop
    const projectParam = (pageStore?.params?.project as string) || (data as any)?.project;
    if (!projectParam) return;

    if (!yjsStore.yjsClient) {
        loadProject(projectParam);
    }
});

async function loadProject(projectNameFromParam?: string) {
    try {
        const projectName = projectNameFromParam ?? (data as any).project;

        // Get Yjs client from project name
        let client = await getYjsClientByProjectTitle(projectName);

        if (client) {
            yjsStore.yjsClient = client as any;
            project = client.getProject();
            // expose project to the global store so pages become available immediately
            store.project = project;
        }
    } catch (err) {
        console.error("Failed to load project:", err);
    }
}

onMount(() => {
    // Keep auth state in sync
    try {
        userManager.addEventListener(() => {
            // If project not yet loaded but param exists, try again when auth flips
            const projectParam = (pageStore?.params?.project as string) || (data as any)?.project;
            if (projectParam && !yjsStore.yjsClient) {
                loadProject(projectParam);
            }
        });
    } catch {}
});
</script>

<div class="main-content">
    {@render children()}
</div>

<style>
.main-content {
    padding-top: 5rem; /* Padding for toolbar height (5rem with margin) */
}
</style>
