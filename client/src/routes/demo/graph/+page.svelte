<script lang="ts">
    import Loader from "../../../components/Loader.svelte";
    import GraphView from "../../../components/GraphView.svelte";
    import Breadcrumb from "../../../components/Breadcrumb.svelte";
    import { onMount, onDestroy } from "svelte";
    import { DemoInitAborted, initializeDemoProject, releaseDemoProject } from "../../../lib/demoInit";
    import { store } from "../../../stores/store.svelte";
    import { yjsStore } from "../../../stores/yjsStore.svelte";
    import { getLogger } from "../../../lib/logger";

    const logger = getLogger("DemoGraphView");
    const projectName = "Demo";

    let isLoading = $state(true);
    let error: string | undefined = $state(undefined);
    let seedWarning: string | undefined = $state(undefined);
    let isDestroyed = false;

    async function initializeDemo() {
        try {
            isLoading = true;
            error = undefined;

            if (!yjsStore.yjsClient || !store.project) {
                // Connects immediately; freshness validation runs in parallel.
                await initializeDemoProject({
                    isDestroyed: () => isDestroyed,
                    onValidated: (update) => {
                        seedWarning = update.seedFailure === "network"
                            ? "Can't reach the demo server — retrying..."
                            : undefined;
                    },
                });
            }
        } catch (err) {
            if (err instanceof DemoInitAborted) return;
            logger.error({ error: err instanceof Error ? err : new Error(String(err)) }, "Failed to load demo graph view");
            error = err instanceof Error ? err.message : "An error occurred while loading the demo page.";
        } finally {
            isLoading = false;
        }
    }

    onMount(() => {
        initializeDemo();
    });

    onDestroy(() => {
        isDestroyed = true;
        try {
            releaseDemoProject();
        } catch (_e) { logger.error(_e); }
    });

</script>

<svelte:head>
    <title>Graph - Demo | Outliner</title>
</svelte:head>

<main class="w-full max-w-7xl mx-auto px-4 py-8 md:px-8">
    <div class="mb-4">
        <Breadcrumb items={[
            { label: "Home", href: "/" },
            { label: "Demo Project", href: "/demo" },
            { label: "Graph View" }
        ]} />

        <!-- Page title -->
        <h1 class="text-2xl font-bold">
            <span class="text-gray-600">{projectName} /</span> Graph View
        </h1>
        <p class="mt-1 text-sm text-gray-500">
            This is a public, collaborative demo space. Content resets every 24 hours.
        </p>
        {#if seedWarning}
            <!-- Non-blocking: freshness validation failed, but already-synced
                 demo content stays visible below. -->
            <p class="mt-1 text-sm text-red-600" data-testid="demo-seed-warning" role="status" aria-live="assertive">
                {seedWarning}
            </p>
        {/if}
    </div>

    {#if isLoading && !store.project}
        <div class="py-8"><Loader message="Loading Demo Graph..." /></div>
    {:else if error}
        <div class="rounded-md bg-red-50 p-4" role="alert" aria-live="assertive">
            <div class="flex">
                <div class="flex-shrink-0">
                    <span class="text-red-400">⚠️</span>
                </div>
                <div class="ml-3">
                    <h2 class="text-sm font-medium text-red-800">An error occurred</h2>
                    <div class="mt-2 text-sm text-red-700">
                        <p>{error}</p>
                    </div>
                    <div class="mt-4">
                        <button type="button"
                            onclick={initializeDemo}
                            class="rounded-md bg-red-100 px-2 py-1.5 text-sm font-medium text-red-800 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            </div>
        </div>
    {:else if store.project}
        <!-- Graph View Component -->
        <div class="graph-container bg-white shadow-sm">
            <GraphView />
        </div>
    {/if}
</main>

<style>
.graph-container {
    width: 100%;
    height: 600px;
    border: 1px solid #ddd;
    border-radius: 8px;
    overflow: hidden;
}




</style>
