<script lang="ts">
    // One catalog type editor: /:project/-/types/:catalogId.
    //
    // The user edits declarative SQL source through the shared SqlEditor, not
    // a command console. Typing only moves the local draft; "Apply type" is
    // the only commit: the draft is validated in a throwaway PGlite schema
    // and, when valid, written to the project doc. Table schemas/records and
    // Grid/Calendar queries are never touched here — the engine picks the
    // applied type up on its own.
    import { onMount, untrack } from "svelte";
    import { userManager } from "../../auth/UserManager";
    import AuthComponent from "../AuthComponent.svelte";
    import Breadcrumb from "../Breadcrumb.svelte";
    import Loader from "../Loader.svelte";
    import SqlEditor from "../yjstable/SqlEditor.svelte";
    import { getLogger } from "../../lib/logger";
    import { resolvePath } from "../../utils/pathUtils";
    import { store } from "../../stores/store.svelte";
    import {
        catalogTypeNameError,
        destroyCatalogUndoManager,
        getCatalogHandles,
        getCatalogName,
        getCatalogSource,
        getSqlCatalogRegistry,
        parseCreateTypeEnum,
        retainCatalogUndoManager,
        setCatalogSource,
        type CatalogHandles,
    } from "../../services/yjstable/sqlCatalog";
    import { isPublicProject, projectBasePath } from "../../lib/publicProject";
    import { projectTypesPath } from "../../lib/managementPaths";
    import { DemoInitAborted } from "../../lib/demoInit";
    import { openRouteProject, type RouteProjectHandle } from "../../lib/routeProject";

    const logger = getLogger("ProjectTypePage");

    interface Props {
        projectName: string;
        catalogId: string;
    }

    let { projectName, catalogId: routeCatalogId }: Props = $props();

    let error: string | undefined = $state(undefined);
    let isAuthenticated = $state(false);
    let notFound = $state(false);
    let isLoading = $state(true);
    let typeName: string | undefined = $state(undefined);
    let handles: CatalogHandles | undefined = $state(undefined);
    let resolvedCatalogId: string | undefined = $state(undefined);

    let isDestroyed = false;
    let projectHandle: RouteProjectHandle | undefined = undefined;
    let observedEntry: { entry: CatalogHandles["entry"]; observer: () => void; } | undefined = undefined;

    // Draft/apply state. Editing only moves the local draft; validation and
    // the project-doc write stay behind the explicit Apply button below.
    let draft = $state("");
    let draftInitialized = $state(false);
    let applyError = $state<string | undefined>(undefined);
    let appliedLabels = $state<string[] | undefined>(undefined);
    let applying = $state(false);

    let isPublicDemo = $derived(isPublicProject(projectName));
    let hasWriteAccess = $derived(isAuthenticated || isPublicDemo);
    let canAccess = $derived(isAuthenticated || isPublicDemo);

    function refreshSourceMirror() {
        if (!store.project?.ydoc || !resolvedCatalogId) return;
        const source = getCatalogSource(store.project.ydoc, resolvedCatalogId);
        if (source === undefined) {
            notFound = true;
            return;
        }
        // Keep the user's in-flight draft: only adopt the doc text when the
        // draft was never initialized (first load) — remote updates to the
        // same entry are rare and must not clobber typing.
        if (!draftInitialized) {
            draft = untrack(() => source);
            draftInitialized = true;
        }
        typeName = getCatalogName(store.project.ydoc, resolvedCatalogId);
    }

    function observeEntry(entry: CatalogHandles["entry"] | undefined) {
        if (observedEntry?.entry === entry) return;
        if (observedEntry) observedEntry.entry.unobserveDeep(observedEntry.observer);
        observedEntry = undefined;
        if (!entry) return;
        const observer = () => refreshSourceMirror();
        entry.observeDeep(observer);
        observedEntry = { entry, observer };
    }

    async function handleAuthSuccess() {
        isAuthenticated = true;
    }

    function handleAuthLogout() {
        isAuthenticated = false;
    }

    async function loadType() {
        if (!projectName || !routeCatalogId || !canAccess) return;

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
            const entry = getSqlCatalogRegistry(store.project.ydoc).get(routeCatalogId);
            if (!entry) {
                logger.warn(`Catalog entry "${routeCatalogId}" not found in project "${projectName}"`);
                notFound = true;
                return;
            }

            const next = getCatalogHandles(store.project.ydoc, routeCatalogId);
            if (!next) {
                notFound = true;
                return;
            }
            if (handles && handles.entry !== next.entry) {
                destroyCatalogUndoManager(handles.entry);
            }
            const entryChanged = !handles || handles.entry !== next.entry;
            handles = next;
            // Claim a reference so a sibling view bound to the same entry
            // keeps its manager when this one unmounts. Only on entry change:
            // reloading the same entry must not stack references.
            if (entryChanged) retainCatalogUndoManager(next.entry);
            observeEntry(next.entry);
            resolvedCatalogId = routeCatalogId;
            draftInitialized = false;
            appliedLabels = undefined;
            applyError = undefined;
            refreshSourceMirror();
        } catch (err) {
            if (err instanceof DemoInitAborted) return;
            logger.error({ error: err }, "Failed to load catalog type page:");
            error = err instanceof Error ? err.message : "An error occurred while loading the type.";
        } finally {
            isLoading = false;
        }
    }

    async function apply() {
        applyError = undefined;
        appliedLabels = undefined;
        if (!store.project?.ydoc || !resolvedCatalogId || !hasWriteAccess) return;
        applying = true;
        try {
            const parsed = await parseCreateTypeEnum(draft);
            const conflict = catalogTypeNameError(store.project.ydoc, resolvedCatalogId, parsed.typeName);
            if (conflict) {
                applyError = conflict;
                return;
            }
            setCatalogSource(store.project.ydoc, resolvedCatalogId, parsed.createSql);
            appliedLabels = parsed.labels;
        } catch (err) {
            applyError = err instanceof Error ? err.message : String(err);
        } finally {
            applying = false;
        }
    }

    $effect(() => {
        if (canAccess && projectName && routeCatalogId) {
            loadType();
        } else {
            isLoading = false;
        }
    });

    onMount(() => {
        isAuthenticated = userManager.getCurrentUser() !== null;

        return () => {
            isDestroyed = true;
            if (observedEntry) {
                observedEntry.entry.unobserveDeep(observedEntry.observer);
                observedEntry = undefined;
            }
            if (handles) {
                destroyCatalogUndoManager(handles.entry);
                handles = undefined;
            }
            projectHandle?.release();
            projectHandle = undefined;
        };
    });
</script>

<svelte:head>
    <title>{typeName ? typeName : "Type"} | Outliner</title>
</svelte:head>

<main class="w-full max-w-7xl mx-auto px-4 py-8 md:px-8 flex flex-col">
    <div class="mb-4 flex-shrink-0">
        <Breadcrumb items={[
            { label: "Home", href: "/" },
            { label: projectName || "Project", href: resolvePath(projectBasePath(projectName)) },
            { label: "Types", href: resolvePath(projectTypesPath(projectName)) },
            { label: typeName || "Type" }
        ]} />
    </div>
    <div class="mb-4 flex items-center flex-shrink-0">
        <h1 class="text-2xl font-bold">
            {typeName || "Type"}
        </h1>
    </div>

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
            <p class="text-sm text-yellow-700">Type not found in project "{projectName}".</p>
        </div>
    {:else if !canAccess}
        <div class="rounded-md bg-blue-50 p-4">
            <p class="text-sm text-blue-700">Please log in to view this type.</p>
        </div>
    {:else if resolvedCatalogId}
        <div class="flex-grow min-h-0 overflow-y-auto flex flex-col gap-4">
            <section class="relative border border-gray-200 rounded-md bg-white p-3" data-testid="sql-catalog-type-editor">
                <p class="text-xs text-gray-500 mb-2">
                    Type definition of this project — shared by every table.
                    One unqualified <code>CREATE TYPE ... AS ENUM (...)</code> statement.
                </p>
                <SqlEditor
                    testId="sql-catalog-source-input"
                    ariaLabel="Type definition (CREATE TYPE AS ENUM)"
                    value={draft}
                    minHeight={140}
                    maxHeight={320}
                    onChange={(next) => {
                        draft = next;
                    }}
                />
                {#if hasWriteAccess}
                    <div class="mt-2">
                        <button
                            type="button"
                            class="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
                            data-testid="sql-catalog-apply"
                            disabled={applying}
                            onclick={apply}
                        >{applying ? "Applying..." : "Apply type"}</button>
                    </div>
                {/if}
                {#if applyError}
                    <p class="text-sm text-red-700 mt-2" data-testid="sql-catalog-error">{applyError}</p>
                {/if}
                {#if appliedLabels}
                    <p class="text-sm text-green-700 mt-2" data-testid="sql-catalog-applied">
                        Type applied with labels: {appliedLabels.join(", ")}
                    </p>
                {/if}
            </section>
        </div>
    {/if}
</main>
