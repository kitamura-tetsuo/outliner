<script lang="ts">
    import { resolve } from "$app/paths";
    import { onMount, onDestroy } from "svelte";
    import OutlinerBase from "../../components/OutlinerBase.svelte";
    import { getLogger } from "../../lib/logger";
    import { getYjsClientByProjectTitle } from "../../services";
    import { yjsStore } from "../../stores/yjsStore.svelte";
    import { store } from "../../stores/store.svelte";

    const logger = getLogger("DemoPage");

    let isLoading = $state(true);
    let error: string | undefined = $state(undefined);

    async function initializeDemo() {
        try {
            isLoading = true;
            error = undefined;

            // Seed demo document via API
            try {
                const response = await fetch('/api/seed-demo', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                if (!response.ok) {
                    logger.warn(`Failed to seed demo: ${response.statusText}`);
                }
            } catch (seedErr) {
                logger.warn(`Error seeding demo ${seedErr}`);
            }

            // Connect to demo room
            let client = await getYjsClientByProjectTitle("demo");
            if (!client) {
                throw new Error("Failed to connect to the demo project.");
            }

            yjsStore.yjsClient = client as any;
            const project = client.getProject();
            store.project = project as any;

            // Wait for sync or timeout
            let retries = 0;
            let demoPage = undefined;

            while (retries < 20) { // 2 seconds max
                const pages = store.project?.items?.length || 0;

                for (let i = 0; i < pages; i++) {
                    const item = store.project?.items?.at?.(i);
                    if (item && item.text === "Demo") {
                        demoPage = item;
                        break;
                    }
                }

                if (!demoPage && pages > 0) {
                     demoPage = store.project?.items?.at?.(0);
                }

                if (demoPage) {
                    break;
                }

                await new Promise(r => setTimeout(r, 100));
                retries++;
            }

            if (!demoPage) {
                logger.warn("Timeout waiting for Demo page to sync");
            }

            store.currentPage = demoPage as any;

        } catch (err) {
            console.error("Failed to initialize demo:", err);
            error = err instanceof Error ? err.message : "An error occurred while loading the demo.";
        } finally {
            isLoading = false;
        }
    }

    onMount(() => {
        initializeDemo();
    });

    onDestroy(() => {
        try {
            yjsStore.yjsClient?.dispose();
            yjsStore.yjsClient = undefined;
            store.project = undefined as any;
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
            <a href={resolve("/")} class="text-blue-600 hover:text-blue-800 hover:underline">
                Home
            </a>
            <span class="mx-2">/</span>
            <span class="text-gray-900">Demo Page</span>
        </nav>

        <div class="flex items-center justify-between">
            <h1 class="text-2xl font-bold">Public Demo</h1>
        </div>
        <p class="text-sm text-gray-500 mt-1">This is a public, collaborative demo space. Content resets every 24 hours.</p>
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
    {:else}
        <OutlinerBase
            pageItem={store.currentPage}
            projectName="demo"
            pageName="Demo"
            isReadOnly={false}
            isTemporary={false}
            onEdit={undefined}
        />
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
