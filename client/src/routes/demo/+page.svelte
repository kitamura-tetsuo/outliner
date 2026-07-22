<script lang="ts">
    import Loader from "../../components/Loader.svelte";
    import { onDestroy, onMount } from "svelte";
    import PageList from "../../components/PageList.svelte";
    import { DEMO_PROJECT_NAME, seedDemo, SeedDemoError } from "../../lib/demoSeed";
    import { getLogger } from "../../lib/logger";
    import { getYjsClientByProjectTitle, removeYjsClientByProjectId } from "../../services";

    const logger = getLogger("DemoListPage");
    import { Project as AppProject } from "../../schema/app-schema";
    import { store } from "../../stores/store.svelte";
    import { yjsStore } from "../../stores/yjsStore.svelte";
        import Breadcrumb from "../../components/Breadcrumb.svelte";

    let isLoading = $state(true);
    let isResetting = $state(false);
    let resetDone = $state(false);
    let resetError: string | undefined = $state(undefined);
    let error: string | undefined = $state(undefined);
    let isDestroyed = false;

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

            yjsStore.yjsClient = client;
            const project = AppProject.fromDoc(client.getProject().ydoc);
            store.project = project;
        } catch (err) {
            logger.error({ error: err instanceof Error ? err : new Error(String(err)) }, "Failed to initialize demo");
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
            resetError = undefined;
            await seedDemo({ force: true, throwOnError: true });
            if (isDestroyed) return;
            removeYjsClientByProjectId(DEMO_PROJECT_NAME);
            yjsStore.yjsClient = undefined;
            store.project = undefined;
            await initializeDemo();
            if (isDestroyed) return;
            resetDone = error === undefined;
            setTimeout(() => { resetDone = false; }, 3000);
        } catch (err) {
            if (err instanceof SeedDemoError && err.rateLimitMs !== undefined) {
                const minutes = Math.ceil(err.rateLimitMs / 60000);
                resetError = `You can only reset the demo content once every ${minutes} minutes. Please try again later.`;
            } else if (err instanceof Error && err.message.includes("rate limited")) {
                resetError = "You can only reset the demo content once every 5 minutes. Please try again later.";
            } else {
                resetError = err instanceof Error ? err.message : "An error occurred while resetting the demo.";
            }
        } finally {
            isResetting = false;
        }
    }

    onMount(() => {
        initializeDemo();
    });

    onDestroy(() => {
        isDestroyed = true;
        try {
            removeYjsClientByProjectId(DEMO_PROJECT_NAME);
            yjsStore.yjsClient = undefined;
            store.project = undefined;
            store.currentPage = undefined;
        } catch {}
    });
</script>

<svelte:head>
    <title>Demo | Outliner</title>
</svelte:head>

<main class="w-full max-w-7xl mx-auto px-4 py-8 md:px-8">
    <div class="mb-4">
        <Breadcrumb items={[
            { label: "Home", href: "/" },
            { label: "Demo Project" }
        ]} />

        <div class="flex items-center justify-between">
            <h1 class="text-2xl font-bold">Public Demo Project</h1>
            <button type="button"
                onclick={resetDemo}
                disabled={isResetting || isLoading}
                data-testid="demo-reset-button"
                aria-busy={isResetting || isLoading}
                class="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 {isResetting || isLoading ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}"
            >
                {#if isResetting}
                    <svg class="mr-2 h-4 w-4 animate-spin text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Resetting...
                {:else}
                    Reset demo content
                {/if}
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
        {#if resetError}
            <p class="mt-1 text-sm text-red-600" data-testid="demo-reset-error" role="status" aria-live="assertive">
                {resetError}
            </p>
        {/if}
    </div>

    {#if isLoading || (yjsStore.notYetSynced && !yjsStore.syncError)}
        <div class="py-8"><Loader message="Loading Demo..." /></div>
    {:else if error || yjsStore.syncError}
        <div class="rounded-md bg-red-50 p-4" role="alert" aria-live="assertive">
            <div class="flex">
                <div class="flex-shrink-0">
                    <span class="text-red-400">⚠️</span>
                </div>
                <div class="ml-3">
                    <h3 class="text-sm font-medium text-red-800">An error occurred</h3>
                    <div class="mt-2 text-sm text-red-700">
                        <p>{error || "Connection to the real-time server failed or timed out."}</p>
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
    {:else if !isLoading && !error && !yjsStore.syncError && !yjsStore.notYetSynced && store.project && pages}
        <div class="mt-6" data-testid="demo-page-list">
            <PageList
                currentUser="anonymous"
                project={store.project}
                rootItems={pages}
            />
        </div>
    {:else if !isLoading && !error}
        <div class="rounded-md bg-gray-50 p-4">
            <p class="text-gray-700">
                Could not load the demo project.
            </p>
        </div>
    {/if}
</main>


