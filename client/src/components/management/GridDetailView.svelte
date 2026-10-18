<script lang="ts">
    // Standalone Grid page: /:project/-/grids/:gridId.
    //
    // A Grid is an independent SELECT + presentation over one source Table
    // (issue #5012). This page owns exactly that — query, column UI, result,
    // chart — and links to the source Table rather than editing its schema.
    // Two Grids over the same Table are two independent pages; both write into
    // the same Table data, because Table data is Table-owned.
    import Loader from "../Loader.svelte";
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { userManager } from "../../auth/UserManager";
    import AuthComponent from "../AuthComponent.svelte";
    import { getLogger } from "../../lib/logger";
    import { store } from "../../stores/store.svelte";
    import { yjsStore } from "../../stores/yjsStore.svelte";
    import { resolve } from "$app/paths";
    import Breadcrumb from "../Breadcrumb.svelte";
    import ProjectGridView from "../yjstable/ProjectGridView.svelte";
    import { getTableHandles, getTableRegistry, listTables } from "../../services/yjstable/tableDocs";
    // The mounted ProjectGridView/YjsTableView retains/releases the Grid's shared undo manager
    // and the Table's for its own lifetime, so this page only resolves handles.
    import { type GridHandles, getGridHandles, getGridSourceTableId } from "../../services/yjstable/gridDocs";
    import { isPublicProject, projectRoute } from "../../lib/publicProject";
    import { projectGridsRoute, projectObjectsSelectedRoute, projectTableRoute } from "../../lib/managementPaths";
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
    let resolvedQuerySource: { tableId: string; name: string; sqlName: string; } | undefined = $state(undefined);
    let resolvedLegacySource: { tableId: string; name: string; sqlName: string; } | undefined = $state(undefined);
    // Set when the Grid exists but its source Table does not: an explicit
    // missing-source state, never a silent empty grid.
    let missingSource = $state(false);
    let projectDoc: NonNullable<typeof store.project>["ydoc"] | undefined = $state(undefined);
    let isDestroyed = false;
    let projectHandle: RouteProjectHandle | undefined = undefined;
    let observedTableRegistry: ReturnType<typeof getTableRegistry> | undefined;

    function refreshSourceTable() {
        if (!projectDoc || !gridHandles) return;
        const resolvedSourceId = getGridSourceTableId(projectDoc, routeGridId);
        const entry = resolvedSourceId
            ? listTables(projectDoc).find(t => t.tableId === resolvedSourceId)
            : undefined;
        const resolvedTable = resolvedSourceId ? getTableHandles(projectDoc, resolvedSourceId) : undefined;
        if (!entry || !resolvedTable) {
            missingSource = true;
            resolvedLegacySource = undefined;
            return;
        }
        missingSource = false;
        resolvedLegacySource = entry;
    }

    function acceptResolvedQuerySource(source: { tableId: string; name: string; sqlName: string; }) {
        // Query evidence describes the Table currently supplying this result;
        // it must not be written back into the legacy ownership fields.
        resolvedQuerySource = source;
    }

    const tableRegistryObserver = () => refreshSourceTable();

    function stopObservingTableRegistry() {
        observedTableRegistry?.unobserveDeep(tableRegistryObserver);
        observedTableRegistry = undefined;
    }

    // Public projects stay readable for anonymous visitors, matching the
    // standalone Table and Calendar routes.
    let isPublicDemo = $derived(isPublicProject(projectName));
    let canAccess = $derived(isAuthenticated || isPublicDemo);

    // Duplicate now opens Object Manager with this Grid preselected instead of
    // the old per-object recursive dependency-scope chooser (issue #5153 §10):
    // the user can duplicate it alone from there, or expand the set first via
    // `Select related`.
    function openDuplicate() {
        goto(projectObjectsSelectedRoute(projectName, routeGridId));
    }

    let displayedSource = $derived(
        resolvedQuerySource ??
            (String(gridHandles?.entry.get("query") ?? "").trim() ? undefined : resolvedLegacySource),
    );
    let sourceTableHref = $derived(
        displayedSource ? projectTableRoute(projectName, displayedSource.tableId) : undefined,
    );
    let displayedSourceTableName = $derived(displayedSource?.name);

    async function handleAuthSuccess() {
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
        missingSource = false;
        resolvedQuerySource = undefined;
        resolvedLegacySource = undefined;
        stopObservingTableRegistry();

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
            if (isDestroyed) return;

            if (!store.project?.ydoc) {
                error = "Failed to load project document.";
                return;
            }

            const handles = getGridHandles(store.project.ydoc, routeGridId);
            if (!handles) {
                logger.warn(`Grid "${routeGridId}" not found in project "${projectName}"`);
                notFound = true;
                return;
            }
            gridHandles = handles;
            gridName = String(handles.entry.get("name") ?? "") || "Grid";
            projectDoc = store.project.ydoc;

            observedTableRegistry = getTableRegistry(store.project.ydoc);
            observedTableRegistry.observeDeep(tableRegistryObserver);
            refreshSourceTable();
            if (missingSource) logger.warn(`Grid "${routeGridId}" has no resolvable source table`);
        } catch (err) {
            if (err instanceof DemoInitAborted) return;
            logger.error({ error: err }, "Failed to load grid page:");
            error = err instanceof Error ? err.message : "An error occurred while loading the grid.";
        } finally {
            isLoading = false;
        }
    }

    $effect(() => {
        if (canAccess && projectName && routeGridId) {
            loadGrid();
        } else {
            isLoading = false;
        }
    });

    onMount(() => {
        isAuthenticated = userManager.getCurrentUser() !== null;

        return () => {
            isDestroyed = true;
            stopObservingTableRegistry();
            projectHandle?.release();
            projectHandle = undefined;
        };
    });
</script>

<svelte:head>
    <title>{gridName ? gridName : "Grid"} | Outliner</title>
</svelte:head>

<main class="w-full h-[calc(100vh-5rem)] max-w-7xl mx-auto px-4 py-8 md:px-8 flex flex-col">
    <div class="mb-4 flex-shrink-0">
        <Breadcrumb items={[
            { label: "Home", href: resolve("/") },
            { label: projectName || "Project", href: projectRoute(projectName) },
            { label: "Grids", href: projectGridsRoute(projectName) },
            { label: gridName || "Grid" }
        ]} />
    </div>
    <div class="mb-4 flex items-baseline gap-3 flex-shrink-0 flex-wrap">
        <h1 class="text-2xl font-bold">
            {gridName || "Grid"}
        </h1>
        {#if sourceTableHref && displayedSourceTableName}
            <a
                class="text-sm text-blue-600 hover:underline"
                href={sourceTableHref}
                data-testid="grid-source-table-link"
            >
                Source table: {displayedSourceTableName}
            </a>
        {/if}
        {#if isAuthenticated && !isLoading && gridHandles && projectDoc}
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

    {#if isLoading}
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
    {:else if !canAccess}
        <div class="rounded-md bg-blue-50 p-4">
            <h3 class="text-sm font-medium text-blue-800">Login required</h3>
            <p class="mt-2 text-sm text-blue-700">Please log in to view this grid.</p>
        </div>
    {:else if gridHandles && projectDoc}
        <div class="flex-grow min-h-0 overflow-y-auto border border-gray-200 rounded-md bg-white p-3">
            {#key `${gridHandles.gridId}:${projectDoc.guid}`}
                <ProjectGridView
                    grid={gridHandles}
                    {projectDoc}
                    projectId={yjsStore.currentProjectId ?? undefined}
                    projectName={projectName}
                    onSourceResolved={acceptResolvedQuerySource}
                />
            {/key}
        </div>
    {/if}
</main>
