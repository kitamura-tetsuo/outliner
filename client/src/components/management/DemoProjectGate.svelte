<script lang="ts">
// Connects a demo management route (`/demo/-/...`) to its public project
// before rendering the management view inside it — the equivalent of what
// `[project]/+layout.svelte` does for authenticated projects, but demo
// routes have no shared layout of their own (AGENTS.md §1: the demo must
// exercise the same management navigation as normal projects).
import type { Snippet } from "svelte";
import { onDestroy, onMount } from "svelte";
import Loader from "../Loader.svelte";
import { DemoInitAborted } from "../../lib/demoInit";
import { getLogger } from "../../lib/logger";
import { openRouteProject, type RouteProjectHandle } from "../../lib/routeProject";
import { store } from "../../stores/store.svelte";

const logger = getLogger("DemoProjectGate");

interface Props {
    projectName: string;
    children: Snippet;
}

let { projectName, children }: Props = $props();

let isLoading = $state(true);
let error: string | undefined = $state(undefined);
let isDestroyed = false;
let projectHandle: RouteProjectHandle | undefined = undefined;
let connectedProject = $state("");

async function connect() {
    isLoading = true;
    error = undefined;
    try {
        projectHandle?.release();
        projectHandle = undefined;
        projectHandle = await openRouteProject(projectName, () => isDestroyed);
        connectedProject = projectName;
        if (isDestroyed) return;
        if (!projectHandle || !store.project) {
            error = "Failed to load the demo project.";
        }
    } catch (err) {
        if (err instanceof DemoInitAborted) return;
        logger.error({ error: err }, "Failed to connect demo project");
        error = err instanceof Error ? err.message : "An error occurred while loading the demo project.";
    } finally {
        isLoading = false;
    }
}

$effect(() => {
    if (projectName) connect();
});

onMount(() => {
    return () => {
        isDestroyed = true;
    };
});

onDestroy(() => {
    projectHandle?.release();
    projectHandle = undefined;
});
</script>

{#if isLoading}
    <div class="flex justify-center py-8">
        <Loader message="Loading Demo Project..." />
    </div>
{:else if error}
    <div class="rounded-md bg-red-50 p-4 m-4" role="alert" aria-live="assertive">
        <p class="text-sm text-red-700">{error}</p>
    </div>
{:else if store.project && connectedProject === projectName}
    {#key store.project.ydoc.guid}
        {@render children()}
    {/key}
{/if}
