<script lang="ts">
    // Project-level SQL catalog list: /:project/-/types.
    //
    // Each entry owns one CREATE TYPE AS ENUM statement shared by every table
    // of the project. Table schemas/records and Grid/Calendar queries stay
    // separate: this list never edits them, it only authors the TYPE
    // definitions tables may reference by plain name.
    import { onMount } from "svelte";
    import { userManager } from "../../auth/UserManager";
    import AuthComponent from "../AuthComponent.svelte";
    import Breadcrumb from "../Breadcrumb.svelte";
    import Loader from "../Loader.svelte";
    import { getLogger } from "../../lib/logger";
    import { resolvePath } from "../../utils/pathUtils";
    import { store } from "../../stores/store.svelte";
    import {
        catalogTypeNameError,
        createCatalogEntry,
        getSqlCatalogRegistry,
        listCatalogEntries,
        removeCatalogEntry,
        type SqlCatalogEntry,
    } from "../../services/yjstable/sqlCatalog";
    import { deriveSqlName } from "../../services/yjstable/sqlNames";
    import { isPublicProject, projectBasePath } from "../../lib/publicProject";
    import { projectTypePath } from "../../lib/managementPaths";
    import { DemoInitAborted } from "../../lib/demoInit";
    import { openRouteProject, type RouteProjectHandle } from "../../lib/routeProject";

    const logger = getLogger("ProjectTypesPage");

    interface Props {
        projectName: string;
    }

    let { projectName }: Props = $props();

    let error: string | undefined = $state(undefined);
    let isAuthenticated = $state(false);
    let notFound = $state(false);
    let isLoading = $state(true);
    let entries = $state<SqlCatalogEntry[]>([]);
    let newName = $state("");
    let createError: string | undefined = $state(undefined);
    let deletingId: string | undefined = $state(undefined);

    let isDestroyed = false;
    let projectHandle: RouteProjectHandle | undefined = undefined;
    let observedRegistry: ReturnType<typeof getSqlCatalogRegistry> | undefined = undefined;
    const registryObserver = () => refresh();
    let loadGeneration = 0;

    let isPublicDemo = $derived(isPublicProject(projectName));
    let canAccess = $derived(isAuthenticated || isPublicDemo);
    let hasWriteAccess = $derived(isAuthenticated || isPublicDemo);

    function refresh() {
        if (!store.project?.ydoc) return;
        entries = listCatalogEntries(store.project.ydoc);
    }

    function observeRegistry(projectDoc: NonNullable<typeof store.project>["ydoc"] | undefined) {
        const registry = projectDoc ? getSqlCatalogRegistry(projectDoc) : undefined;
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

            if (!store.project?.ydoc) {
                error = "Failed to load project document.";
                return;
            }

            observeRegistry(store.project.ydoc);
            refresh();
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
            observeRegistry(undefined);
            projectHandle?.release();
            projectHandle = undefined;
        };
    });

    function typeHref(catalogId: string): string {
        return resolvePath(projectTypePath(projectName, catalogId));
    }

    function createEntry() {
        createError = undefined;
        if (!store.project?.ydoc || !hasWriteAccess) return;
        const displayName = newName.trim() || "New type";
        const taken = listCatalogEntries(store.project.ydoc)
            .map((entry) => {
                const match = entry.source.match(
                    /^\s*create\s+type\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/i,
                );
                return (match?.[1] ?? match?.[2] ?? "").toLowerCase();
            })
            .filter((name) => name.length > 0);
        const typeName = deriveSqlName(displayName, taken);
        const problem = catalogTypeNameError(store.project.ydoc, "", typeName);
        if (problem) {
            createError = problem;
            return;
        }
        createCatalogEntry(
            store.project.ydoc,
            displayName,
            `CREATE TYPE ${typeName} AS ENUM ('a', 'b')`,
        );
        newName = "";
    }

    function deleteEntry(catalogId: string) {
        if (!store.project?.ydoc || !hasWriteAccess) return;
        if (deletingId !== catalogId) {
            deletingId = catalogId;
            return;
        }
        deletingId = undefined;
        removeCatalogEntry(store.project.ydoc, catalogId);
    }
</script>

<svelte:head>
    <title>Types | Outliner</title>
</svelte:head>

<main class="w-full max-w-7xl mx-auto px-4 py-8 md:px-8 flex flex-col">
    <div class="mb-4 flex-shrink-0">
        <Breadcrumb items={[
            { label: "Home", href: "/" },
            { label: projectName || "Project", href: resolvePath(projectBasePath(projectName)) },
            { label: "Types" }
        ]} />
    </div>

    <h1 class="text-2xl font-bold mb-4">Types</h1>
    <p class="text-sm text-gray-500 mb-4">
        Project SQL catalog: each type is one <code>CREATE TYPE ... AS ENUM (...)</code>
        statement. Table schemas reference these types by plain name; Grid and
        Calendar queries stay unchanged.
    </p>

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
    {:else}
        {#if hasWriteAccess}
            <div class="flex gap-2 mb-4 items-center">
                <input
                    class="border border-gray-300 rounded px-2 py-1 text-sm"
                    type="text"
                    placeholder="New type name"
                    aria-label="New type name"
                    data-testid="sql-catalog-new-name"
                    bind:value={newName}
                />
                <button
                    type="button"
                    class="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
                    data-testid="sql-catalog-create"
                    onclick={createEntry}
                >New type</button>
            </div>
            {#if createError}
                <p class="text-sm text-red-700 mb-4" data-testid="sql-catalog-create-error">{createError}</p>
            {/if}
        {/if}
        {#if entries.length === 0}
            <p class="text-sm text-gray-500 italic" data-testid="sql-catalog-list-empty">No types in this project yet.</p>
        {:else}
            <ul class="space-y-2" data-testid="sql-catalog-list">
                {#each entries as entry (entry.catalogId)}
                    <li class="flex items-center gap-2">
                        <a
                            class="text-blue-600 hover:underline"
                            href={typeHref(entry.catalogId)}
                            data-catalog-id={entry.catalogId}
                        >
                            {entry.name || "Untitled type"}
                        </a>
                        {#if hasWriteAccess}
                            <button
                                type="button"
                                class="text-xs text-red-600 hover:underline"
                                data-testid={`sql-catalog-delete-${entry.catalogId}`}
                                onclick={() => deleteEntry(entry.catalogId)}
                            >{deletingId === entry.catalogId ? "Confirm delete" : "Delete"}</button>
                        {/if}
                    </li>
                {/each}
            </ul>
        {/if}
    {/if}
</main>
