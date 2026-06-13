<script lang="ts">
    import { page } from "$app/stores";
    import { onDestroy, onMount } from "svelte";
    import BacklinkPanel from "../../../components/BacklinkPanel.svelte";
    import OutlinerBase from "../../../components/OutlinerBase.svelte";
    import SearchPanel from "../../../components/SearchPanel.svelte";
    import { DEMO_PROJECT_NAME, seedDemo } from "../../../lib/demoSeed";
    import { getLogger } from "../../../lib/logger";
    import { getYjsClientByProjectTitle, removeYjsClientByProjectId } from "../../../services";
    import type { Item } from "../../../schema/app-schema";
    import { store } from "../../../stores/store.svelte";
    import { yjsStore } from "../../../stores/yjsStore.svelte";
    import { resolvePath } from "../../../utils/pathUtils";

    const logger = getLogger("DemoPageView");

    let pageName: string = $derived.by(() => $page.params.page ?? "");

    let isLoading = $state(true);
    let error: string | undefined = $state(undefined);
    let pageNotFound = $state(false);
    let isSearchPanelVisible = $state(false);
    let isResetting = $state(false);
    let resetDone = $state(false);

    function findPage(name: string): Item | undefined {
        const items = store.project?.items;
        if (!items) return undefined;
        const len = items.length || 0;

        let decodedName = name;
        try {
            decodedName = decodeURIComponent(name);
        } catch {}

        for (let i = 0; i < len; i++) {
            const item = items.at?.(i);
            const text = item?.text?.toString?.() ?? String(item?.text ?? "");

            // Check direct match
            if (String(text).toLowerCase() === String(decodedName).toLowerCase()) {
                return item as unknown as Item;
            }

            // Fallback for demo pages: The first line of the item text in PageList
            const title = String(text).split('\n')[0].trim().toLowerCase();
            const targetTitle = String(decodedName).split('\n')[0].trim().toLowerCase();
            if (title === targetTitle) {
                return item as unknown as Item;
            }
        }

        // Also look through children of the first level items because the demo project creates the actual pages as top-level children
        for (let i = 0; i < len; i++) {
            const item = items.at?.(i);
            const childItems = item?.items;
            if (childItems) {
                 const childLen = childItems.length || 0;
                 for (let j = 0; j < childLen; j++) {
                     const childItem = childItems.at?.(j);
                     const childText = childItem?.text?.toString?.() ?? String(childItem?.text ?? "");
                     const childTitle = String(childText).split('\n')[0].trim().toLowerCase();
                     const targetTitle = String(decodedName).split('\n')[0].trim().toLowerCase();
                     if (childTitle === targetTitle) {
                         return childItem as unknown as Item;
                     }
                 }
            }
        }

        return undefined;
    }

    async function loadDemoPage(name: string) {
        try {
            isLoading = true;
            error = undefined;
            pageNotFound = false;
            resetDone = false;

            // Connect once; page switches within /demo reuse the same client
            if (!yjsStore.yjsClient || !store.project || store.project.title !== DEMO_PROJECT_NAME) {
                // Seed demo project via API (no-op when already seeded)
                await seedDemo();

                const client = await getYjsClientByProjectTitle(DEMO_PROJECT_NAME);
                if (!client) {
                    throw new Error("Failed to connect to the demo project.");
                }
                yjsStore.yjsClient = client as unknown as import("../../../yjs/YjsClient").YjsClient;
                store.project = client.getProject() as unknown as import("../../../schema/app-schema").Project;
            }

            // Wait for sync until the page is found (15 seconds max, aligns with regular project page loader)
            let targetPage = findPage(name);
            let retries = 0;
            while (!targetPage && retries < 150) {
                await new Promise(r => setTimeout(r, 100));
                targetPage = findPage(name);
                retries++;
            }

            if (!targetPage) {
                logger.warn(`Demo page "${name}" not found after sync wait`);
                pageNotFound = true;
                return;
            }

            store.currentPage = targetPage;
        } catch (err) {
            console.error("Failed to load demo page:", err);
            error = err instanceof Error ? err.message : "An error occurred while loading the demo page.";
        } finally {
            isLoading = false;
        }
    }


    async function resetDemo() {
        if (isResetting) return;
        try {
            isResetting = true;
            resetDone = false;
            await seedDemo({ force: true });
            removeYjsClientByProjectId(DEMO_PROJECT_NAME);
            yjsStore.yjsClient = undefined;
            store.project = undefined;
            await loadDemoPage(pageName);
            resetDone = error === undefined;
            if (resetDone) {
                setTimeout(() => {
                    resetDone = false;
                }, 3000);
            }
        } catch (err) {
            console.error("Failed to reset demo:", err);
            error = err instanceof Error ? err.message : "An error occurred while resetting the demo.";
        } finally {
            isResetting = false;
        }
    }

    function toggleSearchPanel() {
        isSearchPanelVisible = !isSearchPanelVisible;
    }

let resetEpochCache = $state(0);
    $effect(() => {
        if (store.resetEpoch !== resetEpochCache) {
            resetEpochCache = store.resetEpoch;
            // nullify immediately to disconnect old tree node references
            store.currentPage = undefined;
            // The tree was rebuilt, we must force a remount and reload page logic
            if (pageName && !isLoading) {
                setTimeout(() => {
                    loadDemoPage(pageName);
                }, 100);
            }
        }
    });

    onMount(() => {

        // Follow route parameter changes (e.g. internal links between demo pages)
        let lastLoaded: string | undefined;
        const unsub = page.subscribe(($p) => {
            const name = $p.params?.page ?? "";
            if (!name || name === lastLoaded) return;
            lastLoaded = name;
            loadDemoPage(name);
        });
        return () => unsub();
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
    <title>{pageName ? pageName : "Page"} - Demo | Outliner</title>
</svelte:head>

<main class="container mx-auto px-4 py-4">
    <div class="mb-4">
        <!-- Breadcrumb Navigation -->
        <nav class="mb-2 flex items-center text-sm text-gray-600">
            <a href={resolvePath("/")} class="text-blue-600 hover:text-blue-800 hover:underline">
                Home
            </a>
            <span class="mx-2">/</span>
            <a
                href={resolvePath("/demo")}
                class="text-blue-600 hover:text-blue-800 hover:underline"
            >
                Demo Project
            </a>
            <span class="mx-2">/</span>
            <span class="text-gray-900">{pageName}</span>
        </nav>

        <div class="flex items-center justify-between">
            <h1 class="text-2xl font-bold">
                <span class="text-gray-600">Demo /</span>
                {pageName}
            </h1>
            <div class="flex items-center space-x-2" data-testid="demo-page-toolbar">
                <button
                    onclick={resetDemo}
                    disabled={isResetting || isLoading}
                    data-testid="demo-reset-button"
                    class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {isResetting ? "Resetting..." : "Reset demo content"}
                </button>
                <button
                    onclick={toggleSearchPanel}
                    class="search-btn rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    data-testid="search-toggle-button"
                >
                    Search
                </button>
            </div>
        </div>
        <p class="mt-1 text-sm text-gray-500">
            This is a public, collaborative demo space. Content resets every 24 hours.
        </p>
        {#if resetDone}
            <p class="mt-1 text-sm text-green-600" data-testid="demo-reset-done">
                Demo content has been reset.
            </p>
        {/if}
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
                            onclick={() => loadDemoPage(pageName)}
                            class="rounded-md bg-red-100 px-2 py-1.5 text-sm font-medium text-red-800 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            </div>
        </div>
    {:else if pageNotFound}
        <div class="rounded-md bg-yellow-50 p-4">
            <div class="flex">
                <div class="flex-shrink-0">
                    <span class="text-yellow-400">⚠️</span>
                </div>
                <div class="ml-3">
                    <h3 class="text-sm font-medium text-yellow-800">Page not found</h3>
                    <div class="mt-2 text-sm text-yellow-700">
                        <p>The page "{pageName}" does not exist in the demo project.</p>
                    </div>
                </div>
            </div>
        </div>
{:else}
        {#key `${store.project?.ydoc?.guid || "demo"}-${store.resetEpoch}`}
        <OutlinerBase
            pageItem={store.currentPage}
            projectName={DEMO_PROJECT_NAME}
            pageName={pageName}
            isReadOnly={false}
            isTemporary={false}
            onEdit={undefined}
        />

        {/key}

        <!-- Backlink Panel -->
        {#if store.currentPage}
            <BacklinkPanel {pageName} projectName={DEMO_PROJECT_NAME} />
        {/if}
    {/if}

    <!-- Search Panel -->
    <SearchPanel
        isVisible={isSearchPanelVisible}
        pageItem={store.currentPage}
        project={store.project}
    />
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
