<script lang="ts">
    import { page } from "$app/stores";
    import { onMount } from "svelte";
    import { userManager } from "../../../../auth/UserManager";
    import AuthComponent from "../../../../components/AuthComponent.svelte";
    import { getLogger } from "../../../../lib/logger";
    import { getYjsClientByProjectTitle } from "../../../../services";
    import { store } from "../../../../stores/store.svelte";
    import { yjsStore } from "../../../../stores/yjsStore.svelte";
    import Breadcrumb from "../../../../components/Breadcrumb.svelte";
    import YjsTableView from "../../../../components/yjstable/YjsTableView.svelte";
    import { listTables, getTableHandles } from "../../../../services/yjstable/tableDocs";


    const logger = getLogger("TableStandalonePage");

    // URL params
    let projectName = $derived($page.params.project);
    let tableName = $derived($page.params.table);

    // Page state
    let error: string | undefined = $state(undefined);
    let isAuthenticated = $state(false);
    let notFound = $state(false);
    let isLoading = $state(true);
    let tableHandles: ReturnType<typeof getTableHandles> | undefined = $state(undefined);

    async function handleAuthSuccess() {
        isAuthenticated = true;
    }

    function handleAuthLogout() {
        isAuthenticated = false;
    }

    async function loadTable() {
        if (!projectName || !tableName || !isAuthenticated) return;

        logger.info(`Loading standalone table: project="${projectName}", table="${tableName}"`);
        isLoading = true;
        error = undefined;
        notFound = false;

        try {
            const client = await getYjsClientByProjectTitle(projectName);
            if (!client) {
                notFound = true;
                return;
            }

            yjsStore.yjsClient = client as unknown as NonNullable<typeof yjsStore.yjsClient>;
            const projectDoc = client.getProject?.();
            if (projectDoc) {
                store.project = projectDoc as unknown as NonNullable<typeof store.project>;
            }

            if (!store.project?.ydoc) return;
            const registryEntries = listTables(store.project.ydoc);
            const entry = registryEntries.find(e => e.name === tableName);
            if (!entry) {
                logger.warn(`Table "${tableName}" not found in project "${projectName}"`);
                notFound = true;
                return;
            }

            const handles = getTableHandles(store.project.ydoc, entry.tableId);
            if (!handles) {
                logger.warn(`Handles missing for table "${tableName}" (${entry.tableId})`);
                notFound = true;
                return;
            }

            tableHandles = handles;
        } catch (err) {
            logger.error({ error: err }, "Failed to load table page:");
            error = err instanceof Error ? err.message : "An error occurred while loading the table.";
        } finally {
            isLoading = false;
        }
    }

    $effect(() => {
        if (isAuthenticated && projectName && tableName) {
            loadTable();
        }
    });

    onMount(() => {
        isAuthenticated = userManager.getCurrentUser() !== null;
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
    </div>

    <!-- Authentication component -->
    <div class="auth-section mb-6 flex-shrink-0">
        <AuthComponent
            onAuthSuccess={handleAuthSuccess}
            onAuthLogout={handleAuthLogout}
        />
    </div>

    {#if isLoading}
        <div class="flex justify-center py-8">
            <div class="flex flex-col items-center justify-center space-y-4" aria-busy="true" aria-live="polite" role="status">
                <div class="loader" aria-hidden="true"></div>
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
                        <p>
                            Please log in to view this table.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    {:else if tableHandles}
        <div class="flex-grow min-h-0 relative border border-gray-200 rounded-md overflow-hidden bg-white">
            {#key tableHandles.doc.guid}
                <div class="h-full w-full">
                    <YjsTableView handles={tableHandles} projectId={yjsStore.currentProjectId ?? undefined} tableName={tableName} />
                </div>
            {/key}
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
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
</style>
