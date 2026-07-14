<script lang="ts">

        import { page } from "$app/stores";
    import { onDestroy, onMount } from "svelte";
    import { userManager } from "../../auth/UserManager";
    import AuthComponent from "../../components/AuthComponent.svelte";
    import PageList from "../../components/PageList.svelte";
    import { getLogger } from "../../lib/logger";
    import { DEMO_PROJECT_NAME, seedDemo } from "../../lib/demoSeed";
    import { getYjsClientByProjectTitle, removeYjsClientByProjectId } from "../../services";
    import { store } from "../../stores/store.svelte";
    import { yjsStore } from "../../stores/yjsStore.svelte";
    import Breadcrumb from "../../components/Breadcrumb.svelte";

    const logger = getLogger("ProjectIndex");

    // Get URL parameters (reactively)
    let projectName = $derived.by(() => {
        return $page.params.project;
    });

    // Reactive page list (depends on store.pagesVersion)
    let pages = $derived.by(() => {
        void store.pagesVersion;
        return store.pages?.current;
    });

    // Page state
    let error: string | undefined = $state(undefined);
    let isAuthenticated = $state(false);
    let projectNotFound = $state(false);
    let isLoading = $state(true);
    let isResetting = $state(false);
    let resetDone = $state(false);
    let resetError: string | undefined = $state(undefined);
    let isDestroyed = false;

    // Process on authentication success
    async function handleAuthSuccess() {
        if (import.meta.env.DEV) {
            logger.info("Authentication success");
        }
        isAuthenticated = true;
    }

    // Process on authentication logout
    function handleAuthLogout() {
        if (import.meta.env.DEV) {
            logger.info("Logged out");
        }
        isAuthenticated = false;
    }

    // Load project


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
            await loadProject();
            if (isDestroyed) return;
            resetDone = error === undefined;
            setTimeout(() => { resetDone = false; }, 3000);
        } catch (err) {
            resetError = err instanceof Error ? err.message : "An error occurred while resetting the demo.";
        } finally {
            isResetting = false;
        }
    }

    async function loadProject() {
        if (!projectName || !isAuthenticated) return;

        logger.info(`loadProject: Starting for project="${projectName}"`);
        isLoading = true;
        error = undefined;
        projectNotFound = false;

        try {
            if (projectName === DEMO_PROJECT_NAME) {
                await seedDemo();
                if (isDestroyed) return;
            }
            let client = await getYjsClientByProjectTitle(projectName);
            if (!client) {
                logger.warn(`loadProject: Project client not found for "${projectName}"`);
                projectNotFound = true;
                return;
            }

            // Update store
            yjsStore.yjsClient = client as unknown as NonNullable<typeof yjsStore.yjsClient>;
            const project = client.getProject?.();
            if (project) {
                store.project = project as unknown as NonNullable<typeof store.project>;
                logger.info(`loadProject: Project loaded: "${project.title}", GUID: ${(project as unknown as { ydoc?: { guid?: string } }).ydoc?.guid}`);
            }
        } catch (err) {
            logger.error({ error: err }, "Failed to load project:");
            error = err instanceof Error ? err.message : "An error occurred while loading the project.";
        } finally {
            isLoading = false;
        }
    }

    // Process when a page is selected
    function handlePageSelected(_event: CustomEvent<{ pageId: string; pageName: string; }>) {
        // Navigation is now handled by the <a> tag in PageListItem
    }


    $effect(() => {
        if (isAuthenticated && projectName) {
            loadProject();
        }
    });

    onMount(() => {
        // Check UserManager authentication state
        isAuthenticated = userManager.getCurrentUser() !== null;
    });

    onDestroy(() => {
        // Cleanup code
        isDestroyed = true;
    });
</script>

<svelte:head>
    <title>{projectName ? projectName : "Project"} | Outliner</title>
</svelte:head>

<main class="w-full max-w-7xl mx-auto px-4 py-8 md:px-8">
    <div class="mb-4">
        <Breadcrumb items={[
            { label: "Home", href: "/" },
            { label: projectName === DEMO_PROJECT_NAME ? 'Demo Project' : projectName || 'Project' }
        ]} />
    </div>
    <div class="mb-4 flex items-center justify-between">
        <h1 class="text-2xl font-bold">
            {#if projectName === DEMO_PROJECT_NAME}
                Public Demo Project
            {:else if projectName}
                {projectName}
            {:else}
                Project
            {/if}
        </h1>
        {#if projectName === DEMO_PROJECT_NAME}
            <button type="button"
                onclick={resetDemo}
                disabled={isResetting || isLoading}
                data-testid="demo-reset-button"
                aria-label={isResetting ? "Resetting demo content" : "Reset demo content"}
                class="rounded-md px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 {isResetting || isLoading ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}"
            >
                {isResetting ? "Resetting..." : "Reset demo content"}
            </button>
        {/if}
    </div>
    {#if projectName === DEMO_PROJECT_NAME}
        <p class="mt-1 text-sm text-gray-500 mb-4">
            This is a public, collaborative demo project. Each page demonstrates a group of features. Content resets every 24 hours, or immediately with the reset button.
        </p>
        {#if resetDone}
            <p class="mt-1 text-sm text-green-600 mb-4" data-testid="demo-reset-done" role="status" aria-live="polite">
                Demo content has been reset.
            </p>
        {/if}
        {#if resetError}
            <p class="mt-1 text-sm text-red-600 mb-4" data-testid="demo-reset-error" role="status" aria-live="assertive">
                {resetError}
            </p>
        {/if}
    {/if}

    <!-- Authentication component -->
    <div class="auth-section mb-6">
        <AuthComponent
            onAuthSuccess={handleAuthSuccess}
            onAuthLogout={handleAuthLogout}
        />
    </div>

    {#if isLoading}
        <div class="flex justify-center py-8">
            <div class="flex flex-col items-center justify-center space-y-4" aria-busy="true" aria-live="polite" role="status"><div class="loader" aria-hidden="true"></div><div class="text-gray-600 text-sm font-medium">Loading...</div></div>
        </div>
    {/if}

    {#if error}
        <div class="rounded-md bg-red-50 p-4">
            <div class="flex">
                <div class="flex-shrink-0">
                    <span class="text-red-400">⚠️</span>
                </div>
                <div class="ml-3">
                    <h3 class="text-sm font-medium text-red-800">
                        An error occurred
                    </h3>
                    <div class="mt-2 text-sm text-red-700">
                        <p>{error}</p>
                    </div>
                    <div class="mt-4">
                        <button type="button"
                            onclick={() => window.location.reload()}
                            class="rounded-md bg-red-100 px-2 py-1.5 text-sm font-medium text-red-800 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            </div>
        </div>
    {:else if !isLoading && store.pages.current && store.pages.current.length > 0}
    <div class="mt-6" {...(projectName === DEMO_PROJECT_NAME ? {"data-testid": "demo-page-list"} : {})}>
            <h2 class="mb-4 text-xl font-semibold">Page List</h2>
            <div class="rounded-lg bg-white p-4 shadow-md">
                <PageList
                    currentUser={userManager.getCurrentUser()?.id ||
                        "anonymous"}
                    project={store.project!}
                    projectName={projectName}
                    rootItems={pages!}
                    onPageSelected={handlePageSelected}
                />
            </div>
        </div>
    {:else if !isLoading && store.pages.current && store.pages.current.length === 0}
    <div class="mt-6" {...(projectName === DEMO_PROJECT_NAME ? {"data-testid": "demo-page-list"} : {})}>
            <h2 class="mb-4 text-xl font-semibold">Page List</h2>
            <div class="rounded-lg bg-white p-4 shadow-md">
                <PageList
                    currentUser={userManager.getCurrentUser()?.id ||
                        "anonymous"}
                    project={store.project!}
                    projectName={projectName}
                    rootItems={pages!}
                    onPageSelected={handlePageSelected}
                />
            </div>
        </div>
    {:else if !isLoading && projectNotFound}
        <div class="rounded-md bg-yellow-50 p-4">
            <div class="flex">
                <div class="flex-shrink-0">
                    <span class="text-yellow-400">⚠️</span>
                </div>
                <div class="ml-3">
                    <h3 class="text-sm font-medium text-yellow-800">
                        Project not found
                    </h3>
                    <div class="mt-2 text-sm text-yellow-700">
                        <p>
                            The specified project "{projectName}" does not exist.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    {:else if !isLoading && !isAuthenticated}
        <div class="rounded-md bg-blue-50 p-4">
            <div class="flex">
                <div class="flex-shrink-0">
                    <span class="text-blue-400">ℹ️</span>
                </div>
                <div class="ml-3">
                    <h3 class="text-sm font-medium text-blue-800">
                        Login required
                    </h3>
                    <div class="mt-2 text-sm text-blue-700">
                        <p>
                            Please log in to view this project.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    {:else if !isLoading && !store.pages.current}
        <div class="rounded-md bg-gray-50 p-4">
            <p class="text-gray-700">
                Could not load project data.
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
        0% {
            transform: rotate(0deg);
        }
        100% {
            transform: rotate(360deg);
        }
    }
</style>
