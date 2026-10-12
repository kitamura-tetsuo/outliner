<script lang="ts">
    // Project-level SQL type catalog: /:project/-/types (issue #5574).
    //
    // A thin route shell around SqlCatalogPanel. The panel owns the catalog
    // surface and talks to the catalog service only through the authenticated
    // HTTP transport; this view only resolves the route's project id and
    // never touches catalog Yjs state itself.
    import { onMount } from "svelte";
    import { userManager } from "../../auth/UserManager";
    import AuthComponent from "../AuthComponent.svelte";
    import Breadcrumb from "../Breadcrumb.svelte";
    import Loader from "../Loader.svelte";
    import { getLogger } from "../../lib/logger";
    import { resolvePath } from "../../utils/pathUtils";
    import { isPublicProject, projectBasePath } from "../../lib/publicProject";
    import { DemoInitAborted } from "../../lib/demoInit";
    import { openRouteProject, type RouteProjectHandle } from "../../lib/routeProject";
    import SqlCatalogPanel from "../yjstable/SqlCatalogPanel.svelte";

    const logger = getLogger("ProjectTypesPage");

    interface Props {
        projectName: string;
    }

    let { projectName }: Props = $props();

    let error: string | undefined = $state(undefined);
    let isAuthenticated = $state(false);
    let notFound = $state(false);
    let isLoading = $state(true);
    let projectId = $state<string | undefined>(undefined);

    let isDestroyed = false;
    let projectHandle: RouteProjectHandle | undefined = undefined;
    let loadGeneration = 0;

    let isPublicDemo = $derived(isPublicProject(projectName));
    let canAccess = $derived(isAuthenticated || isPublicDemo);

    async function handleAuthSuccess() {
        isAuthenticated = true;
    }

    function handleAuthLogout() {
        isAuthenticated = false;
    }

    async function loadProject() {
        if (!projectName || !canAccess) return;
        const generation = ++loadGeneration;

        isLoading = true;
        error = undefined;
        notFound = false;

        try {
            projectHandle?.release();
            projectHandle = undefined;
            const handle = await openRouteProject(projectName, () => isDestroyed);
            if (generation !== loadGeneration) {
                handle?.release();
                return;
            }
            projectHandle = handle;
            if (!projectHandle) {
                notFound = true;
                return;
            }
            if (isDestroyed) return;
            projectId = projectHandle.projectId;
        } catch (err) {
            if (err instanceof DemoInitAborted) return;
            if (generation !== loadGeneration) return;
            logger.error({ error: err }, "Failed to load project types page:");
            error = err instanceof Error ? err.message : "An error occurred while loading types.";
        } finally {
            if (generation === loadGeneration) isLoading = false;
        }
    }

    $effect(() => {
        if (canAccess && projectName) {
            loadProject();
        } else {
            isLoading = false;
        }
    });

    onMount(() => {
        isAuthenticated = userManager.getCurrentUser() !== null;

        return () => {
            isDestroyed = true;
            projectHandle?.release();
            projectHandle = undefined;
        };
    });
</script>

<svelte:head>
    <title>SQL Types | Outliner</title>
</svelte:head>

<main class="w-full max-w-7xl mx-auto px-4 py-8 md:px-8 flex flex-col">
    <div class="mb-4 flex-shrink-0">
        <Breadcrumb items={[
            { label: "Home", href: "/" },
            { label: projectName || "Project", href: resolvePath(projectBasePath(projectName)) },
            { label: "SQL Types" }
        ]} />
    </div>

    <h1 class="text-2xl font-bold mb-4">SQL Types</h1>

    <div class="auth-section mb-6 flex-shrink-0">
        {#if isPublicDemo}
            <div class="user-info bg-gray-50 p-3 rounded text-sm text-gray-700 border border-gray-200">
                Public demo / Guest access
            </div>
        {:else}
            <AuthComponent onAuthSuccess={handleAuthSuccess} onAuthLogout={handleAuthLogout} />
        {/if}
    </div>

    {#if isLoading}
        <div class="flex justify-center py-8">
            <Loader />
        </div>
    {:else if error}
        <div class="rounded-md bg-red-50 p-4">
            <p class="text-sm text-red-700">{error}</p>
        </div>
    {:else if notFound}
        <div class="rounded-md bg-yellow-50 p-4">
            <p class="text-sm text-yellow-700">Project not found.</p>
        </div>
    {:else if !canAccess}
        <div class="rounded-md bg-blue-50 p-4">
            <p class="text-sm text-blue-700">Please log in.</p>
        </div>
    {:else if projectId}
        <div data-testid="project-types-panel">
            <SqlCatalogPanel {projectId} />
        </div>
    {/if}
</main>
