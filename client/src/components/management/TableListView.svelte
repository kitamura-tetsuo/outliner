<script lang="ts">
    // Project-level Table list: /:project/-/tables.
    import { onMount } from "svelte";
    import { userManager } from "../../auth/UserManager";
    import AuthComponent from "../AuthComponent.svelte";
    import Breadcrumb from "../Breadcrumb.svelte";
    import Loader from "../Loader.svelte";
    import { getLogger } from "../../lib/logger";
    import { resolvePath } from "../../utils/pathUtils";
    import { store } from "../../stores/store.svelte";
    import { getTableRegistry, listTables, type TableRegistryEntry } from "../../services/yjstable/tableDocs";
    import { isPublicProject, projectBasePath } from "../../lib/publicProject";
    import { projectTablePath } from "../../lib/managementPaths";
    import { DemoInitAborted } from "../../lib/demoInit";
    import { openRouteProject, type RouteProjectHandle } from "../../lib/routeProject";

    const logger = getLogger("ProjectTablesPage");

    interface Props {
        projectName: string;
    }

    let { projectName }: Props = $props();

    let error: string | undefined = $state(undefined);
    let isAuthenticated = $state(false);
    let notFound = $state(false);
    let isLoading = $state(true);
    let tables = $state<TableRegistryEntry[]>([]);

    let isDestroyed = false;
    let projectHandle: RouteProjectHandle | undefined = undefined;
    let observedRegistry: ReturnType<typeof getTableRegistry> | undefined = undefined;
    const registryObserver = () => refresh();

    let isPublicDemo = $derived(isPublicProject(projectName));
    let canAccess = $derived(isAuthenticated || isPublicDemo);

    function refresh() {
        if (!store.project?.ydoc) return;
        tables = listTables(store.project.ydoc);
    }

    function observeRegistry(projectDoc: NonNullable<typeof store.project>["ydoc"] | undefined) {
        const registry = projectDoc ? getTableRegistry(projectDoc) : undefined;
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
            logger.error({ error: err }, "Failed to load project tables page:");
            error = err instanceof Error ? err.message : "An error occurred while loading tables.";
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

    function tableHref(tableId: string): string {
        return resolvePath(projectTablePath(projectName, tableId));
    }
</script>

<svelte:head>
    <title>Tables | Outliner</title>
</svelte:head>

<main class="w-full max-w-7xl mx-auto px-4 py-8 md:px-8 flex flex-col">
    <div class="mb-4 flex-shrink-0">
        <Breadcrumb items={[
            { label: "Home", href: "/" },
            { label: projectName || "Project", href: resolvePath(projectBasePath(projectName)) },
            { label: "Tables" }
        ]} />
    </div>

    <h1 class="text-2xl font-bold mb-4">Tables</h1>

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
    {:else if tables.length === 0}
        <p class="text-sm text-gray-500 italic" data-testid="project-table-list-empty">No tables in this project yet.</p>
    {:else}
        <ul class="space-y-2" data-testid="project-table-list">
            {#each tables as table (table.tableId)}
                <li>
                    <a
                        class="text-blue-600 hover:underline"
                        href={tableHref(table.tableId)}
                        data-table-id={table.tableId}
                    >
                        {table.name || "Untitled table"}
                    </a>
                </li>
            {/each}
        </ul>
    {/if}
</main>
