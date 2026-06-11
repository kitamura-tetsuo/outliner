<script lang="ts">
    import { goto } from "$app/navigation";
    import { onDestroy, onMount } from "svelte";
    import PageList from "../../components/PageList.svelte";
    import { DEMO_PROJECT_NAME, seedDemo } from "../../lib/demoSeed";
    import { getYjsClientByProjectTitle } from "../../services";
    import { store } from "../../stores/store.svelte";
    import { yjsStore } from "../../stores/yjsStore.svelte";
    import { resolvePath } from "../../utils/pathUtils";

    let isLoading = $state(true);
    let error: string | undefined = $state(undefined);

    // Reactive page list (depends on store.pagesVersion)
    let pages = $derived.by(() => {
        void store.pagesVersion;
        return store.pages?.current;
    });

    async function initializeDemo() {
        try {
            isLoading = true;
            error = undefined;

            // Seed demo project via API (no-op when already seeded)
            await seedDemo();

            // Connect to demo room
            const client = await getYjsClientByProjectTitle(DEMO_PROJECT_NAME);
            if (!client) {
                throw new Error("Failed to connect to the demo project.");
            }

            yjsStore.yjsClient = client as import("../../yjs/YjsClient").YjsClient;
            const project = client.getProject();
            store.project = project;
        } catch (err) {
            console.error("Failed to initialize demo:", err);
            error = err instanceof Error ? err.message : "An error occurred while loading the demo.";
        } finally {
            isLoading = false;
        }
    }

    // Navigate to the demo page view when a page is selected
    function handlePageSelected(event: CustomEvent<{ pageId: string; pageName: string; }>) {
        const pageName = event.detail.pageName;
        if (pageName) {
            goto(resolvePath(`/demo/${pageName}`));
        }
    }

    onMount(() => {
        initializeDemo();
    });

    onDestroy(() => {
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
        <!-- Breadcrumb Navigation -->
        <nav class="mb-2 flex items-center text-sm text-gray-600">
            <a href={resolvePath("/")} class="text-blue-600 hover:text-blue-800 hover:underline">
                Home
            </a>
            <span class="mx-2">/</span>
            <span class="text-gray-900">Demo Project</span>
        </nav>

        <div class="flex items-center justify-between">
            <h1 class="text-2xl font-bold">Public Demo Project</h1>
        </div>
        <p class="mt-1 text-sm text-gray-500">
            This is a public, collaborative demo project. Each page demonstrates a group of features. Content resets every 24 hours.
        </p>
    </div>

    {#if isLoading}
        <div class="flex justify-center py-8">
            <div class="loader">Loading Demo...</div>
        </div>
    {:else if error}
        <div class="rounded-md bg-red-50 p-4">
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
