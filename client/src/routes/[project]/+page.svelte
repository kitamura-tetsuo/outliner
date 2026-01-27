<script lang="ts">
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { onDestroy, onMount } from "svelte";
    import { userManager } from "../../auth/UserManager";
    import AuthComponent from "../../components/AuthComponent.svelte";
    import PageList from "../../components/PageList.svelte";
    import { getLogger } from "../../lib/logger";
    import { store } from "../../stores/store.svelte";
    import { getYjsClientByProjectTitle } from "../../services";
    import { yjsStore } from "../../stores/yjsStore.svelte";

    const logger = getLogger("ProjectIndex");

    // Get URL parameters (reactively)
    let projectName = $derived($page.params.project || "");

    // Reactive page list (depends on store.pagesVersion)
    let pages = $derived.by(() => {
        void store.pagesVersion;
        return store.pages?.current;
    });

    // Page state
    let error: string | undefined = $state(undefined);
    let isLoading = $state(true);
    let isAuthenticated = $state(false);
    let projectNotFound = $state(false);

    /**
     * ロード条件を評価し、必要であればロードを開始する
     */
    function scheduleLoadIfNeeded() {
        if (!projectName || !isAuthenticated) return;
        loadProject();
    }

    async function loadProject() {
        logger.info(`loadProject: Starting for project="${projectName}"`);
        isLoading = true;
        error = undefined;
        projectNotFound = false;

        try {
            let client = await getYjsClientByProjectTitle(projectName);
            if (!client) {
                throw new Error(
                    `Project "${projectName}" could not be loaded.`,
                );
            }
            yjsStore.yjsClient = client as any;
            const project = client.getProject?.();
            if (!project) {
                throw new Error("Project data not found in client");
            }
            store.project = project as any;
            logger.info(`loadProject: Project loaded: "${project.title}"`);
        } catch (err) {
            console.error("Failed to load project:", err);
            error =
                err instanceof Error
                    ? err.message
                    : "An error occurred while loading the project.";
        } finally {
            isLoading = false;
        }
    }

    // Process on auth success
    async function handleAuthSuccess(authResult: any) {
        if (import.meta.env.DEV) {
            logger.info("Authentication successful:", authResult);
        }
        isAuthenticated = true;
    }

    // Process on auth logout
    function handleAuthLogout() {
        if (import.meta.env.DEV) {
            logger.info("Logged out");
        }
        isAuthenticated = false;
    }

    // Process on page selected
    function handlePageSelected(event: CustomEvent) {
        const pageName = event.detail.pageName;

        if (pageName) {
            goto(`/${projectName}/${pageName}`);
        }
    }

    // Go back to home
    function goHome() {
        goto("/");
    }

    onMount(async () => {
        // Check UserManager auth state
        const user = userManager.getCurrentUser();
        isAuthenticated = user !== null;
        if (isAuthenticated) {
            scheduleLoadIfNeeded();
        } else {
            // Wait for auth (for tests)
            let retries = 0;
            while (!userManager.getCurrentUser() && retries < 50) {
                await new Promise((r) => setTimeout(r, 100));
                retries++;
            }
            if (userManager.getCurrentUser()) {
                isAuthenticated = true;
                scheduleLoadIfNeeded();
            }
        }
    });

    // Reactively load when projectName changes
    $effect(() => {
        if (projectName && isAuthenticated) {
            scheduleLoadIfNeeded();
        }
    });

    onDestroy(() => {
        // Cleanup code
    });
</script>

<svelte:head>
    <title>{projectName ? projectName : "Project"} | Outliner</title>
</svelte:head>

<main class="container mx-auto px-4 py-4">
    <div class="mb-4 flex items-center">
        <button
            onclick={goHome}
            class="mr-4 text-blue-600 hover:text-blue-800 hover:underline"
        >
            ← Back to Home
        </button>
        <h1 class="text-2xl font-bold">
            {#if projectName}
                {projectName}
            {:else}
                Project
            {/if}
        </h1>
    </div>

    <!-- Auth component -->
    <div class="auth-section mb-6">
        <AuthComponent
            onAuthSuccess={handleAuthSuccess}
            onAuthLogout={handleAuthLogout}
        />
    </div>

    {#if isLoading}
        <div class="flex flex-col items-center justify-center py-12">
            <div
                class="loader mb-4 h-12 w-12 rounded-full border-4 border-gray-200 border-t-blue-500 animate-spin"
            ></div>
            <p class="text-gray-600">Loading project...</p>
        </div>
    {:else if store.pages}
        <div class="mt-6">
            <h2 class="mb-4 text-xl font-semibold">Pages</h2>
            <div class="rounded-lg bg-white p-4 shadow-md">
                <PageList
                    currentUser={userManager.getCurrentUser()?.id ||
                        "anonymous"}
                    project={store.project!}
                    rootItems={pages}
                    onPageSelected={handlePageSelected}
                />
            </div>
        </div>
    {:else if error}
        <div class="rounded-md bg-red-50 p-4">
            <div class="flex">
                <div class="flex-shrink-0">
                    <span class="text-red-400">⚠️</span>
                </div>
                <div class="ml-3">
                    <h3 class="text-sm font-medium text-red-800">
                        Error occurred
                    </h3>
                    <div class="mt-2 text-sm text-red-700">
                        <p>{error}</p>
                    </div>
                    <div class="mt-4">
                        <button
                            onclick={() => window.location.reload()}
                            class="rounded-md bg-red-100 px-2 py-1.5 text-sm font-medium text-red-800 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            </div>
        </div>
    {:else if projectNotFound}
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
                            The specified project "{projectName}" does not
                            exist.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    {:else if !isAuthenticated}
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
                        <p>Please login to view this project.</p>
                    </div>
                </div>
            </div>
        </div>
    {:else}
        <div class="rounded-md bg-gray-50 p-4">
            <p class="text-gray-700">Could not load project data.</p>
        </div>
    {/if}
</main>

<style>
    /* .loader {  Removed as unused */
    /* .loader {
    border: 4px solid #f3f3f3;
    border-top: 4px solid #3498db;
    border-radius: 50%;
    width: 30px;
    height: 30px;
    animation: spin 1s linear infinite;
    margin: 0 auto;
} */

    @keyframes spin {
        0% {
            transform: rotate(0deg);
        }
        100% {
            transform: rotate(360deg);
        }
    }
</style>
