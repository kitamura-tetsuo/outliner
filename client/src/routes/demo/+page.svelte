<script lang="ts">

    import { onDestroy, onMount } from "svelte";
    import PageList from "../../components/PageList.svelte";
    import { DEMO_PROJECT_NAME, seedDemo } from "../../lib/demoSeed";
    import { getLogger } from "../../lib/logger";
    import { getYjsClientByProjectTitle, removeYjsClientByProjectId } from "../../services";

    const logger = getLogger("DemoListPage");
    import { store } from "../../stores/store.svelte";
    import { yjsStore } from "../../stores/yjsStore.svelte";
        import Breadcrumb from "../../components/Breadcrumb.svelte";

    let isLoading = $state(true);
    let isResetting = $state(false);
    let resetDone = $state(false);
    let error: string | undefined = $state(undefined);
    let isDestroyed = false;

    // Reactive page list (depends on store.pagesVersion)
    let pages = $derived(store.pages?.current);

    async function initializeDemo() {
        try {
            isLoading = true;
            error = undefined;

            // Seed demo project via API (no-op when already seeded)
            await seedDemo();
            if (isDestroyed) return;

            // Connect to demo room
            const client = await getYjsClientByProjectTitle(DEMO_PROJECT_NAME);
            if (isDestroyed) {
                client?.dispose();
                return;
            }
            if (!client) {
                throw new Error("Failed to connect to the demo project.");
            }

            yjsStore.yjsClient = client as unknown as import("../../yjs/YjsClient").YjsClient;
            const project = client.getProject() as unknown as import("../../schema/app-schema").Project;
            store.project = project;
        } catch (err) {
            logger.error({ error: err }, "Failed to initialize demo");
            error = err instanceof Error ? err.message : "An error occurred while loading the demo.";
        } finally {
            isLoading = false;
        }
    }

    // Manually trigger the reset that otherwise runs every 24 hours, then
    // reconnect with a fresh client so the page list reflects the reseeded
    // content instead of relying on live sync into the old document state.
    async function resetDemo() {
        if (isResetting) return;
        try {
            isResetting = true;
            resetDone = false;
            await seedDemo({ force: true });
            if (isDestroyed) return;
            removeYjsClientByProjectId(DEMO_PROJECT_NAME);
            yjsStore.yjsClient = undefined;
            store.project = undefined;
            await initializeDemo();
            if (isDestroyed) return;
            resetDone = error === undefined;
            setTimeout(() => { resetDone = false; }, 3000);
        } finally {
            isResetting = false;
        }
    }

    // Navigate to the demo page view when a page is selected
    function handlePageSelected(_event: CustomEvent<{ pageId: string; pageName: string; }>) {
        // Navigation is now handled by the <a> tag in PageListItem
    }

    onMount(() => {
        initializeDemo();
    });

    onDestroy(() => {
        isDestroyed = true;
        try {
            yjsStore.yjsClient?.dispose();
            yjsStore.yjsClient = undefined;
            store.project = undefined;
            store.currentPage = undefined;
        } catch {}
    });
</script>

<svelte:head>
    <title>Demo | Outliner</title>
</svelte:head>

<main class="container mx-auto px-4 py-4">
    <div class="mb-4">
        <Breadcrumb items={[
            { label: "Home", href: "/" },
            { label: "Demo Project" }
        ]} />

        <div class="flex items-center justify-between">
            <h1 class="text-2xl font-bold">Public Demo Project</h1>
            <button
                onclick={resetDemo}
                disabled={isResetting || isLoading}
                data-testid="demo-reset-button"
                aria-label={isResetting ? "Resetting demo content" : "Reset demo content"}
                class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {isResetting ? "Resetting..." : "Reset demo content"}
            </button>
        </div>
        <p class="mt-1 text-sm text-gray-500">
            This is a public, collaborative demo project. Each page demonstrates a group of features. Content resets every 24 hours, or immediately with the reset button.
        </p>
        {#if resetDone}
            <p class="mt-1 text-sm text-green-600" data-testid="demo-reset-done" role="status" aria-live="polite">
                Demo content has been reset.
            </p>
        {/if}
    </div>

    {#if isLoading}
        <div class="flex flex-col items-center justify-center py-8 space-y-4" aria-busy="true" aria-live="polite" role="status">
            <div class="loader" aria-hidden="true"></div>
            <div class="text-gray-600 text-sm font-medium">Loading Demo...</div>
        </div>
    {:else if error}
        <div class="rounded-md bg-red-50 p-4" role="alert" aria-live="assertive">
            <div class="flex">
                <div class="flex-shrink-0">
                    <span class="text-red-400">⚠️</span>
                </div>
                <div class="ml-3">
                    <h3 class="text-sm font-medium text-red-800">An error occurred</h3>
                    <div class="mt-2 text-sm text-red-700">
                        <p>{error}</p>
                    </div>
                    <div class="mt-4">
                        <button
                            onclick={initializeDemo}
                            class="rounded-md bg-red-100 px-2 py-1.5 text-sm font-medium text-red-800 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            </div>
        </div>
    {:else if store.project && pages}
        <div class="mt-6" data-testid="demo-page-list">
            <PageList
                currentUser="anonymous"
                project={store.project}
                rootItems={pages}
                onPageSelected={handlePageSelected}
            />
        </div>
    {:else}
        <div class="rounded-md bg-gray-50 p-4">
            <p class="text-gray-700">
                Could not load the demo project.
            </p>
        </div>
    {/if}
</main>

<style>
    .loader {
        border: 4px solid #f3f3f3;
        border-top: 4px solid #3498db;
        border-radius: 50%;
        width: 30px;
        height: 30px;
        animation: spin 1s linear infinite;
        margin: 0 auto;
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
</style>
