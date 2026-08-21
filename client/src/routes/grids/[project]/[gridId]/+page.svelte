<script lang="ts">
    // Standalone Grid page: /grids/<project>/<gridId>.
    //
    // A Grid is an independent SELECT + presentation over one source Table
    // (issue #5012). This page owns exactly that — query, column UI, result,
    // chart — and links to the source Table rather than editing its schema.
    // Two Grids over the same Table are two independent pages; both write into
    // the same Table data, because Table data is Table-owned.
    import Loader from "../../../../components/Loader.svelte";
    import { page } from "$app/stores";
    import { onMount } from "svelte";
    import { userManager } from "../../../../auth/UserManager";
    import AuthComponent from "../../../../components/AuthComponent.svelte";
    import { getLogger } from "../../../../lib/logger";
    import { store } from "../../../../stores/store.svelte";
    import { yjsStore } from "../../../../stores/yjsStore.svelte";
    import Breadcrumb from "../../../../components/Breadcrumb.svelte";
    import YjsTableView from "../../../../components/yjstable/YjsTableView.svelte";
    import { getTableHandles, listTables } from "../../../../services/yjstable/tableDocs";
    // The mounted YjsTableView retains/releases the Grid's shared undo manager
    // and the Table's for its own lifetime, so this page only resolves handles.
    import { type GridHandles, getGridHandles, getGridSourceTableId } from "../../../../services/yjstable/gridDocs";
    import { isPublicProject } from "../../../../lib/publicProject";
    import { DemoInitAborted } from "../../../../lib/demoInit";
    import { openRouteProject, type RouteProjectHandle } from "../../../../lib/routeProject";

    const logger = getLogger("GridStandalonePage");

    // URL params
    let projectName = $derived($page.params.project);
    let routeGridId = $derived($page.params.gridId);

    // Page state
    let error: string | undefined = $state(undefined);
    let isAuthenticated = $state(false);
    let notFound = $state(false);
    let isLoading = $state(true);
    let gridName: string | undefined = $state(undefined);
    let gridHandles: GridHandles | undefined = $state(undefined);
    let tableHandles: ReturnType<typeof getTableHandles> | undefined = $state(undefined);
    let sourceTableId: string | undefined = $state(undefined);
    let sourceTableName: string | undefined = $state(undefined);
    let sourceTableSqlName: string | undefined = $state(undefined);
    // Set when the Grid exists but its source Table does not: an explicit
    // missing-source state, never a silent empty grid.
    let missingSource = $state(false);
    let projectDoc: NonNullable<typeof store.project>["ydoc"] | undefined = $state(undefined);
    let isDestroyed = false;
    let projectHandle: RouteProjectHandle | undefined = undefined;

    // Public projects stay readable for anonymous visitors, matching the
    // standalone Table and Calendar routes.
    let isPublicDemo = $derived(isPublicProject(projectName));
    let canAccess = $derived(isAuthenticated || isPublicDemo);

    let sourceTableHref = $derived(
        sourceTableId
            ? `/tables/${encodeURIComponent(projectName)}/${encodeURIComponent(sourceTableId)}`
            : undefined,
    );

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

            const resolvedSourceId = getGridSourceTableId(store.project.ydoc, routeGridId);
            const entry = resolvedSourceId
                ? listTables(store.project.ydoc).find(t => t.tableId === resolvedSourceId)
                : undefined;
            const resolvedTable = resolvedSourceId
                ? getTableHandles(store.project.ydoc, resolvedSourceId)
                : undefined;
            if (!entry || !resolvedTable) {
                logger.warn(`Grid "${routeGridId}" has no resolvable source table`);
                missingSource = true;
                sourceTableId = resolvedSourceId;
                return;
            }

            sourceTableId = entry.tableId;
            sourceTableName = entry.name;
            sourceTableSqlName = entry.sqlName || undefined;
            tableHandles = resolvedTable;
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
            { label: "Home", href: "/" },
            { label: projectName || "Project", href: `/${encodeURIComponent(projectName)}` },
            { label: "Grids" },
            { label: gridName || "Grid" }
        ]} />
    </div>
    <div class="mb-4 flex items-baseline gap-3 flex-shrink-0 flex-wrap">
        <h1 class="text-2xl font-bold">
            {gridName || "Grid"}
        </h1>
        {#if sourceTableHref && sourceTableName}
            <a
                class="text-sm text-blue-600 hover:underline"
                href={sourceTableHref}
                data-testid="grid-source-table-link"
            >
                Source table: {sourceTableName}
            </a>
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
    {:else if missingSource}
        <div class="rounded-md bg-yellow-50 p-4" data-testid="grid-missing-source">
            <h3 class="text-sm font-medium text-yellow-800">Source table missing</h3>
            <p class="mt-2 text-sm text-yellow-700">
                This grid selects from a table that no longer exists in project "{projectName}".
                Point it at an existing table, or delete the grid.
            </p>
        </div>
    {:else if !canAccess}
        <div class="rounded-md bg-blue-50 p-4">
            <h3 class="text-sm font-medium text-blue-800">Login required</h3>
            <p class="mt-2 text-sm text-blue-700">Please log in to view this grid.</p>
        </div>
    {:else if gridHandles && tableHandles && projectDoc}
        <div class="flex-grow min-h-0 overflow-y-auto border border-gray-200 rounded-md bg-white p-3">
            {#key `${gridHandles.gridId}:${tableHandles.doc.guid}`}
                <YjsTableView
                    grid={gridHandles}
                    handles={tableHandles}
                    projectDoc={projectDoc}
                    projectId={yjsStore.currentProjectId ?? undefined}
                    tableName={sourceTableName}
                    sqlName={sourceTableSqlName}
                    sourceTableHref={sourceTableHref}
                />
            {/key}
        </div>
    {/if}
</main>
