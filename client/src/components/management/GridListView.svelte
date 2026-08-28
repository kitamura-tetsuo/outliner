<script lang="ts">
    // Project-level Grid list: /:project/-/grids.
    import { onMount } from "svelte";
    import { userManager } from "../../auth/UserManager";
    import AuthComponent from "../AuthComponent.svelte";
    import Breadcrumb from "../Breadcrumb.svelte";
    import Loader from "../Loader.svelte";
    import { getLogger } from "../../lib/logger";
    import { resolvePath } from "../../utils/pathUtils";
    import { store } from "../../stores/store.svelte";
    import { getGridRegistry, listGrids, type GridRegistryEntry } from "../../services/yjstable/gridDocs";
    import { isPublicProject, projectBasePath } from "../../lib/publicProject";
    import { projectGridPath } from "../../lib/managementPaths";
    import { DemoInitAborted } from "../../lib/demoInit";
    import { openRouteProject, type RouteProjectHandle } from "../../lib/routeProject";

    const logger = getLogger("ProjectGridsPage");

    interface Props {
        projectName: string;
    }

    let { projectName }: Props = $props();

    let error: string | undefined = $state(undefined);
    let isAuthenticated = $state(false);
    let notFound = $state(false);
    let isLoading = $state(true);
    let grids = $state<GridRegistryEntry[]>([]);

    let isDestroyed = false;
    let projectHandle: RouteProjectHandle | undefined = undefined;
    let observedRegistry: ReturnType<typeof getGridRegistry> | undefined = undefined;
    const registryObserver = () => refresh();

    let isPublicDemo = $derived(isPublicProject(projectName));
    let canAccess = $derived(isAuthenticated || isPublicDemo);

    function refresh() {
        if (!store.project?.ydoc) return;
        grids = listGrids(store.project.ydoc);
    }

    function observeRegistry(projectDoc: NonNullable<typeof store.project>["ydoc"] | undefined) {
        const registry = projectDoc ? getGridRegistry(projectDoc) : undefined;
        if (observedRegistry === registry) return;
        observedRegistry?.unobserveDeep(registryObserver);
        observedRegistry = registry;
        observedRegistry?.observeDeep(registryObserver);
    }

    async function handleAuthSuccess() {
        isAuthenticated = true;
    }

    function handleAuthLogout() {
        isAuthenticated = false;
    }

    async function loadProject() {
        if (!projectName || !canAccess) return;

        isLoading = true;
        error = undefined;
        notFound = false;

        try {
            projectHandle?.release();
            projectHandle = undefined;
            projectHandle = await openRouteProject(projectName, () => isDestroyed);
            if (!projectHandle) {
                notFound = true;
                return;
            }
            if (isDestroyed) return;

            if (!store.project?.ydoc) {
                error = "Failed to load project document.";
                return;
            }

            observeRegistry(store.project.ydoc);
            refresh();
        } catch (err) {
            if (err instanceof DemoInitAborted) return;
            logger.error({ error: err }, "Failed to load project grids page:");
            error = err instanceof Error ? err.message : "An error occurred while loading grids.";
        } finally {
            isLoading = false;
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
            observeRegistry(undefined);
            projectHandle?.release();
            projectHandle = undefined;
        };
    });

    function gridHref(gridId: string): string {
        return resolvePath(projectGridPath(projectName, gridId));
    }
</script>

<svelte:head>
    <title>Grids | Outliner</title>
</svelte:head>

<main class="w-full max-w-7xl mx-auto px-4 py-8 md:px-8 flex flex-col">
    <div class="mb-4 flex-shrink-0">
        <Breadcrumb items={[
            { label: "Home", href: "/" },
            { label: projectName || "Project", href: resolvePath(projectBasePath(projectName)) },
            { label: "Grids" }
        ]} />
    </div>

    <h1 class="text-2xl font-bold mb-4">Grids</h1>

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
    {:else if grids.length === 0}
        <p class="text-sm text-gray-500 italic" data-testid="project-grid-list-empty">No grids in this project yet.</p>
    {:else}
        <ul class="space-y-2" data-testid="project-grid-list">
            {#each grids as grid (grid.gridId)}
                <li>
                    <a
                        class="text-blue-600 hover:underline"
                        href={gridHref(grid.gridId)}
                        data-grid-id={grid.gridId}
                    >
                        {grid.name || "Untitled grid"}
                    </a>
                </li>
            {/each}
        </ul>
    {/if}
</main>
