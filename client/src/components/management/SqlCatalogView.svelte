<script lang="ts">
    // Project-level TYPE catalog: /:project/-/types.
    //
    // The discoverable authorized surface for Project SQL TYPE source
    // (issue #5574). It lists persisted declaration identities, kinds and
    // resolved names, and lets authorized users create, inspect, edit and
    // delete source through the shared SqlEditor wrapper. Every mutation
    // travels the authenticated SqlCatalogService transport; anonymous or
    // grant-less callers are refused before anything reaches Yjs.
    //
    // TYPE source stays separate from Table schema/record editors and Grid
    // SELECT editors: this view imports neither tableDocs/gridDocs state nor
    // any Table/Grid editor, and the catalog persists under its own
    // `projectSqlCatalog` key (see services/yjstable/sqlCatalog.ts).
    import { onMount } from "svelte";
    import { userManager } from "../../auth/UserManager";
    import AuthComponent from "../AuthComponent.svelte";
    import Breadcrumb from "../Breadcrumb.svelte";
    import Loader from "../Loader.svelte";
    import SqlEditor from "../yjstable/SqlEditor.svelte";
    import { getLogger } from "../../lib/logger";
    import { resolvePath } from "../../utils/pathUtils";
    import { store } from "../../stores/store.svelte";
    import { isPublicProject, projectBasePath } from "../../lib/publicProject";
    import { DemoInitAborted } from "../../lib/demoInit";
    import { openRouteProject, type RouteProjectHandle } from "../../lib/routeProject";
    import {
        SqlCatalogAuthError,
        SqlCatalogError,
        SqlCatalogService,
        classifySource,
        getCatalogRegistry,
        listCatalogDeclarations,
        type SqlCatalogDeclaration,
    } from "../../services/yjstable/sqlCatalog";

    const logger = getLogger("SqlCatalogView");

    interface Props {
        projectName: string;
    }

    let { projectName }: Props = $props();

    let error: string | undefined = $state(undefined);
    let isAuthenticated = $state(false);
    let notFound = $state(false);
    let isLoading = $state(true);
    let declarations = $state<SqlCatalogDeclaration[]>([]);
    let selectedId = $state<string | undefined>(undefined);
    let createDraft = $state("");
    let editDraft = $state("");
    let notice = $state<string | undefined>(undefined);
    let noticeKind = $state<"ok" | "error">("ok");

    let isDestroyed = false;
    let projectHandle: RouteProjectHandle | undefined = undefined;
    let catalogService: SqlCatalogService | undefined = undefined;
    let observedRegistry: ReturnType<typeof getCatalogRegistry> | undefined = undefined;
    const registryObserver = () => refresh();
    let loadGeneration = 0;

    let isPublicDemo = $derived(isPublicProject(projectName));
    let canAccess = $derived(isAuthenticated || isPublicDemo);
    // Mutating controls require an authenticated write grant; browsing the
    // declaration list does not. Demo projects stay writable for everyone,
    // mirroring the Object Manager's `hasWriteAccess` derivation.
    let hasWriteAccess = $derived(isAuthenticated || isPublicDemo);

    let selected = $derived(declarations.find((d) => d.id === selectedId));

    function showNotice(kind: "ok" | "error", message: string) {
        noticeKind = kind;
        notice = message;
    }

    function refresh() {
        if (!store.project?.ydoc) return;
        declarations = listCatalogDeclarations(store.project.ydoc);
        if (selectedId && !declarations.some((d) => d.id === selectedId)) {
            selectedId = undefined;
            editDraft = "";
        }
    }

    function observeRegistry() {
        const registry = store.project?.ydoc ? getCatalogRegistry(store.project.ydoc) : undefined;
        if (observedRegistry === registry) return;
        observedRegistry?.unobserveDeep(registryObserver);
        observedRegistry = registry;
        observedRegistry?.observeDeep(registryObserver);
    }

    function resolveAuth() {
        return {
            userId: userManager.getCurrentUser()?.id,
            hasWriteGrant: hasWriteAccess,
            projectId: projectName,
        };
    }

    function ensureService(): SqlCatalogService | undefined {
        if (catalogService) return catalogService;
        const ydoc = store.project?.ydoc;
        if (!ydoc) return undefined;
        catalogService = new SqlCatalogService(ydoc, { projectId: projectName, resolveAuth });
        return catalogService;
    }

    function reportFailure(err: unknown, operation: string) {
        if (err instanceof SqlCatalogAuthError) {
            showNotice("error", err.message);
        } else if (err instanceof SqlCatalogError) {
            showNotice("error", err.message);
        } else {
            logger.error({ error: err }, `Failed to ${operation} TYPE declaration:`);
            showNotice("error", err instanceof Error ? err.message : `Failed to ${operation} TYPE declaration.`);
        }
    }

    function handleCreate() {
        notice = undefined;
        const service = ensureService();
        if (!service) return;
        const classification = classifySource(createDraft);
        if (classification.kind !== "ENUM") {
            showNotice("error", classification.reason);
            return;
        }
        try {
            const created = service.create(createDraft);
            createDraft = "";
            selectedId = created.id;
            editDraft = created.source;
            showNotice("ok", `Declared TYPE "${created.name}".`);
            refresh();
        } catch (err) {
            reportFailure(err, "create");
        }
    }

    function handleSelect(declaration: SqlCatalogDeclaration) {
        notice = undefined;
        selectedId = declaration.id;
        editDraft = declaration.source;
    }

    function handleSave() {
        notice = undefined;
        const service = ensureService();
        if (!service || !selectedId) return;
        const classification = classifySource(editDraft);
        if (classification.kind !== "ENUM") {
            showNotice("error", classification.reason);
            return;
        }
        try {
            const updated = service.update(selectedId, editDraft);
            editDraft = updated.source;
            showNotice("ok", `Updated TYPE "${updated.name}".`);
            refresh();
        } catch (err) {
            reportFailure(err, "edit");
        }
    }

    function handleDelete() {
        notice = undefined;
        const service = ensureService();
        if (!service || !selectedId) return;
        try {
            if (service.remove(selectedId)) {
                showNotice("ok", "Deleted TYPE declaration.");
            }
            selectedId = undefined;
            editDraft = "";
            refresh();
        } catch (err) {
            reportFailure(err, "delete");
        }
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
            catalogService = undefined;
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

            observeRegistry();
            refresh();
        } catch (err) {
            if (err instanceof DemoInitAborted) return;
            if (generation !== loadGeneration) return;
            logger.error({ error: err }, "Failed to load project TYPE catalog:");
            error = err instanceof Error ? err.message : "An error occurred while loading the TYPE catalog.";
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
            observedRegistry?.unobserveDeep(registryObserver);
            observedRegistry = undefined;
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

    <h1 class="text-2xl font-bold mb-2">Project SQL types</h1>
    <p class="text-sm text-gray-700 mb-4">
        TYPE definitions belong to the project. Only <code>CREATE TYPE … AS ENUM</code> is
        executable here; any other statement is reported as unsupported. Table schemas,
        records and Grid queries are edited on their own pages.
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
        {#if notice}
            <div
                class={noticeKind === "ok" ? "rounded-md bg-green-50 p-4 mb-4" : "rounded-md bg-red-50 p-4 mb-4"}
                data-testid="sql-catalog-notice"
            >
                <p class={noticeKind === "ok" ? "text-sm text-green-700" : "text-sm text-red-700"}>{notice}</p>
            </div>
        {/if}
        {#if !hasWriteAccess}
            <p class="rounded-md bg-gray-50 p-3 mb-4 text-sm text-gray-700 border border-gray-200" data-testid="sql-catalog-readonly">
                You have read-only access. You can browse TYPE declarations, but creating, editing and deleting require sign-in.
            </p>
        {/if}

        <div class="flex flex-col md:flex-row gap-6">
            <section class="md:w-1/3" aria-label="TYPE declarations">
                <h2 class="text-lg font-semibold mb-2">Declarations</h2>
                {#if declarations.length === 0}
                    <p class="text-sm text-gray-700 italic" data-testid="sql-catalog-empty">
                        No TYPE declarations in this project yet.
                    </p>
                {:else}
                    <ul class="space-y-2" data-testid="sql-catalog-list">
                        {#each declarations as declaration (declaration.id)}
                            <li>
                                <button
                                    type="button"
                                    class="block w-full text-left rounded border px-3 py-2 hover:border-blue-400"
                                    class:border-blue-500={declaration.id === selectedId}
                                    class:bg-blue-50={declaration.id === selectedId}
                                    class:border-gray-200={declaration.id !== selectedId}
                                    onclick={() => handleSelect(declaration)}
                                    data-testid={`sql-catalog-item-${declaration.id}`}
                                    data-declaration-id={declaration.id}
                                    data-declaration-kind={declaration.kind}
                                    data-declaration-name={declaration.name}
                                >
                                    <span class="font-mono text-sm font-semibold">{declaration.name}</span>
                                    <span class="ml-2 text-xs text-gray-700">{declaration.kind}</span>
                                    <span class="block text-xs text-gray-700">
                                        {declaration.labels.length} label{declaration.labels.length === 1 ? "" : "s"}: {declaration.labels.join(", ")}
                                    </span>
                                </button>
                            </li>
                        {/each}
                    </ul>
                {/if}

                {#if hasWriteAccess}
                    <h2 class="text-lg font-semibold mt-6 mb-2">New declaration</h2>
                    <SqlEditor
                        value={createDraft}
                        ariaLabel="New TYPE source (CREATE TYPE AS ENUM)"
                        testId="sql-catalog-create"
                        onChange={(value) => { createDraft = value; }}
                    />
                    <button
                        type="button"
                        class="mt-2 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                        onclick={handleCreate}
                        data-testid="sql-catalog-create-button"
                    >Declare TYPE</button>
                {/if}
            </section>

            <section class="md:w-2/3" aria-label="TYPE source">
                {#if selected}
                    <h2 class="text-lg font-semibold mb-2">
                        <span class="font-mono">{selected.name}</span>
                        <span class="ml-2 text-xs font-normal text-gray-700">{selected.kind} · {selected.id}</span>
                    </h2>
                    <SqlEditor
                        value={editDraft}
                        ariaLabel={`TYPE source for ${selected.name}`}
                        testId="sql-catalog-editor"
                        readOnly={!hasWriteAccess}
                        onChange={(value) => { editDraft = value; }}
                    />
                    {#if hasWriteAccess}
                        <div class="mt-2 flex gap-2">
                            <button
                                type="button"
                                class="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                                onclick={handleSave}
                                data-testid="sql-catalog-save-button"
                            >Save source</button>
                            <button
                                type="button"
                                class="rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                                onclick={handleDelete}
                                data-testid="sql-catalog-delete-button"
                            >Delete declaration</button>
                        </div>
                    {/if}
                {:else}
                    <p class="text-sm text-gray-700 italic" data-testid="sql-catalog-no-selection">
                        Select a declaration to inspect its source.
                    </p>
                {/if}
            </section>
        </div>
    {/if}
</main>
