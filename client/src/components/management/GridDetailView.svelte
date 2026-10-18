<script lang="ts">
    // Standalone Grid page: /:project/-/grids/:gridId.
    //
    // A Grid owns its query and presentation. The shared runtime resolves
    // its actual SQL dependencies; Table pages retain schema ownership.
    import Loader from "../Loader.svelte";
    import { onMount, untrack } from "svelte";
    import { goto } from "$app/navigation";
    import { userManager } from "../../auth/UserManager";
    import AuthComponent from "../AuthComponent.svelte";
    import { getLogger } from "../../lib/logger";
    import { store } from "../../stores/store.svelte";
    import { projectStore } from "../../stores/projectStore.svelte";
    import { yjsStore } from "../../stores/yjsStore.svelte";
    import { resolve } from "$app/paths";
    import Breadcrumb from "../Breadcrumb.svelte";
    import ProjectGridView from "../yjstable/ProjectGridView.svelte";
    // History follows Project/Grid/Table ownership, not this route renderer.
    import { type GridHandles, getGridHandles, getGridRegistry } from "../../services/yjstable/gridDocs";
    import { isPublicProject, projectRoute } from "../../lib/publicProject";
    import {
        projectGridsRoute,
        projectObjectsSelectedRoute,
    } from "../../lib/managementPaths";
    import { DemoInitAborted } from "../../lib/demoInit";
    import { openRouteProject, type RouteProjectHandle } from "../../lib/routeProject";

    const logger = getLogger("GridStandalonePage");

    interface Props {
        projectName: string;
        gridId: string;
    }

    let { projectName, gridId: routeGridId }: Props = $props();

    // Page state
    let error: string | undefined = $state(undefined);
    let isAuthenticated = $state(false);
    let notFound = $state(false);
    let isLoading = $state(true);
    let gridName: string | undefined = $state(undefined);
    let gridHandles: GridHandles | undefined = $state(undefined);
    let projectDoc: NonNullable<typeof store.project>["ydoc"] | undefined = $state(undefined);
    let admittedProjectId = $state<string | undefined>();
    let accessDenied = $state(false);
    let releaseGridObserver: (() => void) | undefined;
    let releaseAccessListener: (() => void) | undefined;
    let isDestroyed = false;
    let projectHandle: RouteProjectHandle | undefined = undefined;

    // Public projects stay readable for anonymous visitors, matching the
    // standalone Table and Calendar routes.
    let isPublicDemo = $derived(isPublicProject(projectName));
    let canAccess = $derived(isPublicDemo || (isAuthenticated && !accessDenied && (!admittedProjectId
        || (projectStore.isLoaded && projectStore.projects.some(project => project.id === admittedProjectId)))));


    // Duplicate now opens Object Manager with this Grid preselected instead of
    // the old per-object recursive dependency-scope chooser (issue #5153 §10):
    // the user can duplicate it alone from there, or expand the set first via
    // `Select related`.
    function openDuplicate() {
        goto(projectObjectsSelectedRoute(projectName, routeGridId));
    }

    async function handleAuthSuccess() {
        if (!isAuthenticated) accessDenied = false;
        isAuthenticated = true;
    }

    function handleAuthLogout() {
        isAuthenticated = false;
    }

    async function loadGrid() {
        if (!projectName || !routeGridId || !canAccess) return;

        logger.info(`Loading standalone grid: project="${projectName}", grid="${routeGridId}"`);
        isLoading = true;
        error = undefined;
        notFound = false;

        try {
            // Releases the previous reference before taking another, so a
            // parameter change cannot leak a demo client reference.
            projectHandle?.release();
            projectHandle = undefined;
            projectHandle = await openRouteProject(projectName, () => isDestroyed);
            if (!projectHandle) {
                notFound = true;
                return;
            }
            if (isDestroyed || !canAccess) return;
            admittedProjectId = projectHandle.projectId;
            releaseAccessListener?.();
            const client = yjsStore.yjsClient;
            if (client && !isPublicDemo) {
                const previous = client.onAccessDenied;
                const denied = () => { previous?.(); accessDenied = true; };
                client.onAccessDenied = denied;
                releaseAccessListener = () => {
                    if (client.onAccessDenied === denied) client.onAccessDenied = previous;
                };
            }

            if (!store.project?.ydoc) {
                error = "Failed to load project document.";
                return;
            }

            projectDoc = store.project.ydoc;
            observeGrid(projectDoc, routeGridId);

        } catch (err) {
            if (err instanceof DemoInitAborted) return;
            logger.error({ error: err }, "Failed to load grid page:");
            error = err instanceof Error ? err.message : "An error occurred while loading the grid.";
        } finally {
            isLoading = false;
        }
    }

    function observeGrid(doc: NonNullable<typeof projectDoc>, id: string): void {
        releaseGridObserver?.();
        const registry = getGridRegistry(doc);
        let observed: GridHandles | undefined;
        const syncName = () => gridName = observed ? String(observed.entry.get("name") ?? "") || "Grid" : undefined;
        const sync = () => {
            const next = getGridHandles(doc, id);
            if (observed?.entry !== next?.entry) {
                observed?.entry.unobserve(syncName);
                observed = next;
                gridHandles = next;
                observed?.entry.observe(syncName);
            }
            syncName();
            notFound = !next;
        };
        registry.observe(sync);
        sync();
        releaseGridObserver = () => { registry.unobserve(sync); observed?.entry.unobserve(syncName); };
    }

    $effect(() => {
        const shouldLoad = canAccess && Boolean(projectName) && Boolean(routeGridId);
        if (shouldLoad) {
            // loadGrid updates its own loading/source state. Keep those writes
            // out of this dependency set so accepting query evidence cannot
            // recursively reopen and tear down the same Grid.
            untrack(() => void loadGrid());
        } else {
            isLoading = false;
        }
    });

    onMount(() => {
        isAuthenticated = userManager.getCurrentUser() !== null;
        const unsubscribeAuth = userManager.addEventListener(result => isAuthenticated = result !== null);

        return () => {
            isDestroyed = true;
            unsubscribeAuth();
            releaseGridObserver?.();
            releaseAccessListener?.();
            projectHandle?.release();
            projectHandle = undefined;
        };
    });
</script>

<svelte:head>
    <title>{canAccess && gridName ? gridName : "Grid"} | Outliner</title>
</svelte:head>

<main class="w-full h-[calc(100vh-5rem)] max-w-7xl mx-auto px-4 py-8 md:px-8 flex flex-col">
    <div class="mb-4 flex-shrink-0">
        <Breadcrumb items={[
            { label: "Home", href: resolve("/") },
            { label: projectName || "Project", href: projectRoute(projectName) },
            { label: "Grids", href: projectGridsRoute(projectName) },
            { label: canAccess ? gridName || "Grid" : "Grid" }
        ]} />
    </div>
    <div class="mb-4 flex items-baseline gap-3 flex-shrink-0 flex-wrap">
        <h1 class="text-2xl font-bold">
            {canAccess ? gridName || "Grid" : "Grid"}
        </h1>
        {#if canAccess && isAuthenticated && !isLoading && gridHandles && projectDoc}
            <button
                class="ml-auto rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                onclick={openDuplicate}
                data-testid="grid-duplicate-button"
            >Duplicate Grid</button>
        {/if}
    </div>

    <!-- Authentication component -->
    <div class="auth-section mb-6 flex-shrink-0">
        {#if isPublicDemo}
            <div class="user-info bg-gray-50 p-3 rounded text-sm text-gray-700 border border-gray-200">
                Public demo / Guest access
            </div>
        {:else}
            <AuthComponent
                onAuthSuccess={handleAuthSuccess}
                onAuthLogout={handleAuthLogout}
            />
        {/if}
    </div>

    {#if !canAccess}
        <div class="rounded-md bg-blue-50 p-4">
            <h3 class="text-sm font-medium text-blue-800">{isAuthenticated ? "Access denied" : "Login required"}</h3>
            <p class="mt-2 text-sm text-blue-700">Please log in to view this grid.</p>
        </div>
    {:else if isLoading}
        <div class="flex justify-center py-8">
            <div class="flex flex-col items-center justify-center space-y-4" aria-busy="true" aria-live="polite" role="status">
                <Loader />
                <div class="text-gray-600 text-sm font-medium">Loading...</div>
            </div>
        </div>
    {:else if error}
        <div class="rounded-md bg-red-50 p-4">
            <p class="text-sm text-red-700">{error}</p>
        </div>
    {:else if notFound}
        <div class="rounded-md bg-yellow-50 p-4">
            <h3 class="text-sm font-medium text-yellow-800">Grid not found</h3>
            <p class="mt-2 text-sm text-yellow-700">
                The specified grid does not exist in project "{projectName}".
            </p>
        </div>
    {:else if gridHandles && projectDoc}
        <div class="flex-grow min-h-0 overflow-y-auto border border-gray-200 rounded-md bg-white p-3">
            {#key projectDoc.guid}
            {#key gridHandles.entry}
                <ProjectGridView
                    grid={gridHandles}
                    {projectDoc}
                    projectId={yjsStore.currentProjectId ?? undefined}
                    projectName={projectName}
                    canWrite={() => Boolean(canAccess)}
                />
            {/key}
            {/key}
        </div>
    {/if}
</main>
