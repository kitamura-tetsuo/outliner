<script lang="ts">
    import Loader from "../../../../components/Loader.svelte";
    import { page } from "$app/stores";
    import { onMount } from "svelte";
    import { userManager } from "../../../../auth/UserManager";
    import AuthComponent from "../../../../components/AuthComponent.svelte";
    import { getLogger } from "../../../../lib/logger";
    import { store } from "../../../../stores/store.svelte";
    import { yjsStore } from "../../../../stores/yjsStore.svelte";
    import Breadcrumb from "../../../../components/Breadcrumb.svelte";
    import TableEntityView from "../../../../components/yjstable/TableEntityView.svelte";
    import TableGridReferences from "../../../../components/yjstable/TableGridReferences.svelte";
    import TableScheduleReferences from "../../../../components/schedule/TableScheduleReferences.svelte";
    import { listTables, getTableHandles, destroyTableUndoManager } from "../../../../services/yjstable/tableDocs";
    import { getTableDependencies, removeTableWithPolicy, type TableDependencies, type DeleteTablePolicy } from "../../../../services/yjstable/tableDependencies";
    import { goto } from "$app/navigation";
        import { isPublicProject } from "../../../../lib/publicProject";
    import { DemoInitAborted } from "../../../../lib/demoInit";
    import { openRouteProject, type RouteProjectHandle } from "../../../../lib/routeProject";
    import ObjectDuplicationDialog from "../../../../components/yjstable/ObjectDuplicationDialog.svelte";


    const logger = getLogger("TableStandalonePage");

    // URL params
    let projectName = $derived($page.params.project);
    let routeTableId = $derived($page.params.tableId);

    // Page state
    let error: string | undefined = $state(undefined);
    let isAuthenticated = $state(false);
    let notFound = $state(false);
    let isLoading = $state(true);
    let tableName: string | undefined = $state(undefined);
    let tableHandles: ReturnType<typeof getTableHandles> | undefined = $state(undefined);
    let resolvedTableId: string | undefined = $state(undefined);
    let tableSqlName: string | undefined = $state(undefined);
    let tableProjectDoc: NonNullable<typeof store.project>["ydoc"] | undefined = $state(undefined);
    let isDestroyed = false;
    let projectHandle: RouteProjectHandle | undefined = undefined;

    let showDeleteDialog = $state(false);
    let dependencies = $state<TableDependencies | undefined>(undefined);
    let deleteActionError = $state<string | undefined>(undefined);
    let isDeleting = $state(false);
    let showDuplicationDialog = $state(false);

    // Public projects stay readable for anonymous visitors. Deriving the gate
    // instead of folding the demo case into `isAuthenticated` keeps the auth
    // callbacks below from clobbering it once Firebase resolves to no user.
    let isPublicDemo = $derived(isPublicProject(projectName));
    let hasWriteAccess = $derived(isAuthenticated && !isPublicDemo);
    let canAccess = $derived(isAuthenticated || isPublicDemo);

    function startDelete() {
        // The resolved id, not the route parameter: a Table URL may carry the
        // SQL name, and dependencies are keyed by Table id.
        if (!hasWriteAccess || !store.project || !resolvedTableId) return;
        dependencies = getTableDependencies(store.project, resolvedTableId);
        showDeleteDialog = true;
        deleteActionError = undefined;
    }

    async function executeDelete(policy: DeleteTablePolicy) {
        if (!hasWriteAccess || !store.project || !resolvedTableId) return;
        const tableId = resolvedTableId;
        isDeleting = true;
        deleteActionError = undefined;
        try {
            // Unmount table view before destroying document
            const currentHandles = tableHandles;
            tableHandles = undefined;
            if (currentHandles?.doc) {
                destroyTableUndoManager(currentHandles.doc);
            }

            const result = removeTableWithPolicy(store.project, tableId, policy);

            if (result) {
                logger.info(`Deleted table ${tableId} with policy ${policy}`);
            }
            showDeleteDialog = false;
            goto(`/${encodeURIComponent(projectName)}`);
        } catch (err) {
            logger.error({ error: err }, "Failed to delete table");
            deleteActionError = err instanceof Error ? err.message : "An error occurred while deleting the table.";
            isDeleting = false;
            // Recover handles if deletion failed
            if (store.project) {
                tableHandles = getTableHandles(store.project.ydoc, tableId);
            }
        }
    }

    async function handleAuthSuccess() {
        isAuthenticated = true;
    }

    function handleAuthLogout() {
        isAuthenticated = false;
    }

    async function loadTable() {
        if (!projectName || !routeTableId || !canAccess) return;

        logger.info(`Loading standalone table: project="${projectName}", table="${routeTableId}"`);
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
            if (isDestroyed) return;

            if (!store.project?.ydoc) {
                error = "Failed to load project document.";
                return;
            }
            const registryEntries = listTables(store.project.ydoc);
            // The route carries the display name; falling back to the SQL name
            // keeps links written against the identifier working too.
            const entry = registryEntries.find(e => e.tableId === routeTableId)
                ?? registryEntries.find(e => e.sqlName === routeTableId);
            if (!entry) {
                logger.warn(`Table "${routeTableId}" not found in project "${projectName}"`);
                notFound = true;
                return;
            }

            const handles = getTableHandles(store.project.ydoc, entry.tableId);
            if (!handles) {
                logger.warn(`Handles missing for table "${routeTableId}" (${entry.tableId})`);
                notFound = true;
                return;
            }

            // This page is about the Table entity: schema and data. It must
            // never resolve, select or create a Grid — a Table is viewable and
            // editable with zero Grids in the project (issue #5012). Grids and
            // Schedules appear below only as references.
            tableHandles = handles;
            resolvedTableId = entry.tableId;
            tableSqlName = entry.sqlName || undefined;
            tableName = entry.name;
            // Held explicitly: the engine session needs the registry doc for
            // name lookups and conflict checks.
            tableProjectDoc = store.project.ydoc;
        } catch (err) {
            if (err instanceof DemoInitAborted) return;
            logger.error({ error: err }, "Failed to load table page:");
            error = err instanceof Error ? err.message : "An error occurred while loading the table.";
        } finally {
            isLoading = false;
        }
    }

    $effect(() => {
        if (canAccess && projectName && routeTableId) {
            loadTable();
        } else {
            isLoading = false;
        }
    });

    onMount(() => {
        isAuthenticated = userManager.getCurrentUser() !== null;

        return () => {
            isDestroyed = true;
            if (tableHandles?.doc) {
                destroyTableUndoManager(tableHandles.doc);
            }
            projectHandle?.release();
            projectHandle = undefined;
        };
    });
</script>

<svelte:head>
    <title>{tableName ? tableName : "Table"} | Outliner</title>
</svelte:head>

<main class="w-full h-[calc(100vh-5rem)] max-w-7xl mx-auto px-4 py-8 md:px-8 flex flex-col">
    <div class="mb-4 flex-shrink-0">
        <Breadcrumb items={[
            { label: "Home", href: "/" },
            { label: projectName || "Project", href: `/${encodeURIComponent(projectName)}` },
            { label: "Tables" },
            { label: tableName || "Table" }
        ]} />
    </div>
    <div class="mb-4 flex items-center flex-shrink-0">
        <h1 class="text-2xl font-bold">
            {tableName || "Table"}
        </h1>
        {#if hasWriteAccess && !isLoading && tableHandles}
            <div class="ml-auto flex gap-2">
                <button
                    class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
                    onclick={() => { showDuplicationDialog = true; }}
                >Duplicate Table</button>
                <button
                    class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 text-sm font-medium"
                    onclick={startDelete}
                    aria-label="Delete table"
                >
                    Delete table
                </button>
            </div>
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
                </div>
            </div>
        </div>
    {:else if notFound}
        <div class="rounded-md bg-yellow-50 p-4">
            <div class="flex">
                <div class="flex-shrink-0">
                    <span class="text-yellow-400">⚠️</span>
                </div>
                <div class="ml-3">
                    <h3 class="text-sm font-medium text-yellow-800">
                        Table not found
                    </h3>
                    <div class="mt-2 text-sm text-yellow-700">
                        <p>
                            The specified table "{tableName}" does not exist in project "{projectName}".
                        </p>
                    </div>
                </div>
            </div>
        </div>
    {:else if !canAccess}
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
                            Please log in to view this table.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    {:else if tableHandles && resolvedTableId}
        <div class="flex-grow min-h-0 overflow-y-auto flex flex-col gap-4">
            <div class="relative border border-gray-200 rounded-md bg-white p-3">
                {#key tableHandles.doc.guid}
                    {#if tableProjectDoc}
                        <TableEntityView
                            handles={tableHandles}
                            projectDoc={tableProjectDoc}
                            projectId={yjsStore.currentProjectId ?? undefined}
                        />
                    {/if}
                {/key}
            </div>

            <!-- Both panels bind Yjs observers on mount and never rebind, so
                 they are keyed on the project doc and the resolved table
                 (AGENTS.md §11: remount, never rebind). Navigating between two
                 tables already tears this branch down — `loadTable` raises
                 `isLoading` before its first await — but that is an incidental
                 property of the loading flag; the key is what makes a switch
                 within a mounted instance impossible. -->
            {#key `${tableProjectDoc?.guid ?? ""}:${resolvedTableId}`}
                {#if tableProjectDoc}
                    <TableGridReferences
                        projectDoc={tableProjectDoc}
                        projectName={projectName}
                        tableId={resolvedTableId}
                    />
                {/if}

                <TableScheduleReferences
                    project={store.project}
                    projectName={projectName}
                    tableId={resolvedTableId}
                />
            {/key}
        </div>
    {/if}
</main>

{#if showDeleteDialog && dependencies}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title">
        <div class="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
            <div class="px-6 py-4 border-b border-gray-200">
                <h2 id="delete-dialog-title" class="text-lg font-bold text-gray-900">Delete table "{tableName}"</h2>
            </div>

            <div class="px-6 py-4 overflow-y-auto flex-grow">
                <p class="text-gray-700 mb-4">
                    Table deletion is destructive and cannot be undone using the global Undo button.
                    Nothing below belongs to the table — these are the project entities that
                    reference it and would break:
                </p>

                {#if dependencies.dependentGridIds.length > 0}
                    <div class="mb-4">
                        <h3 class="font-semibold text-gray-900 mb-1">Grids sourced from this table ({dependencies.dependentGridIds.length})</h3>
                        <p class="text-xs text-gray-500 mb-1">Each grid selects from this table and has no other source.</p>
                    </div>
                {/if}

                {#if dependencies.directGridReferences.length > 0}
                    <div class="mb-4">
                        <h3 class="font-semibold text-gray-900 mb-1">Outline blocks showing those grids ({dependencies.directGridReferences.length})</h3>
                        <ul class="list-disc pl-5 text-sm text-gray-600 max-h-32 overflow-y-auto">
                            {#each dependencies.directGridReferences as ref (ref.itemKey)}
                                <li>Page "{ref.pageTitle}"
                                    {#if ref.itemText} - "{ref.itemText.substring(0, 30)}{ref.itemText.length > 30 ? '...' : ''}"{/if}
                                </li>
                            {/each}
                        </ul>
                    </div>
                {/if}

                {#if dependencies.scheduleReferences.length > 0}
                    <div class="mb-4">
                        <h3 class="font-semibold text-gray-900 mb-1">Schedules referencing this table ({dependencies.scheduleReferences.length})</h3>
                        <p class="text-xs text-gray-500 mb-1">
                            Schedules belong to the project; a schedule may reference other tables too.
                        </p>
                        <ul class="list-disc pl-5 text-sm text-gray-600 max-h-32 overflow-y-auto">
                            {#each dependencies.scheduleReferences as ref (ref.ruleId)}
                                <li>
                                    Schedule "{ref.ruleName}"
                                    &mdash; {ref.kind === "write-target" ? "writes to this table" : "reads this table"}
                                </li>
                            {/each}
                        </ul>
                    </div>
                {/if}

                {#if dependencies.indirectSqlReferences.length > 0}
                    <div class="mb-4 bg-yellow-50 border border-yellow-200 rounded p-3">
                        <h3 class="font-semibold text-yellow-800 mb-1">Indirect SQL dependencies ({dependencies.indirectSqlReferences.length})</h3>
                        <p class="text-xs text-yellow-700 mb-2">These queries explicitly reference the SQL name <code>{tableSqlName}</code> and may fail after deletion.</p>
                        <ul class="list-disc pl-5 text-sm text-yellow-700 max-h-32 overflow-y-auto">
                            {#each dependencies.indirectSqlReferences as ref (ref.name)}
                                <li>{ref.type}: "{ref.name}"</li>
                            {/each}
                        </ul>
                    </div>
                {/if}

                {#if dependencies.dependentGridIds.length === 0 && dependencies.directGridReferences.length === 0 && dependencies.scheduleReferences.length === 0 && dependencies.indirectSqlReferences.length === 0}
                    <p class="text-sm text-gray-600 italic">Nothing in this project references this table.</p>
                {/if}

                {#if deleteActionError}
                    <div class="mt-4 p-3 bg-red-50 text-red-700 text-sm rounded border border-red-200">
                        {deleteActionError}
                    </div>
                {/if}
            </div>

            <div class="px-6 py-4 border-t border-gray-200 flex flex-col gap-3">
                {#if dependencies.directGridReferences.length > 0 || dependencies.dependentGridIds.length > 0 || dependencies.scheduledTargets.length > 0}
                    <button
                        type="button"
                        class="w-full px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded hover:bg-red-100 font-medium disabled:opacity-50"
                        onclick={() => executeDelete("keep-references")}
                        disabled={isDeleting}
                    >
                        Delete table and keep references
                    </button>
                    <button
                        type="button"
                        class="w-full px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-medium disabled:opacity-50"
                        onclick={() => executeDelete("remove-direct-references")}
                        disabled={isDeleting}
                    >
                        Delete table and remove direct references
                    </button>
                {:else}
                    <button
                        type="button"
                        class="w-full px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-medium disabled:opacity-50"
                        onclick={() => executeDelete("keep-references")}
                        disabled={isDeleting}
                    >
                        Delete table
                    </button>
                {/if}
                <button
                    type="button"
                    class="w-full px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded hover:bg-gray-50 font-medium disabled:opacity-50"
                    onclick={() => { showDeleteDialog = false; }}
                    disabled={isDeleting}
                >
                    Cancel
                </button>
            </div>
        </div>
    </div>
{/if}

{#if showDuplicationDialog && tableProjectDoc && resolvedTableId}
    <ObjectDuplicationDialog
        sourceDoc={tableProjectDoc}
        sourceProject={projectName}
        object={{ type: "table", id: resolvedTableId }}
        onclose={() => { showDuplicationDialog = false; }}
    />
{/if}
