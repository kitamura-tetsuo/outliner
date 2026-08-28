<script lang="ts">
    import { goto } from "$app/navigation";
    import type * as Y from "yjs";
    import { Project } from "$shared/app-schema";
    import { userManager } from "../../auth/UserManager";
    import { appendGridPlacement } from "../../services/yjstable/gridPlacement";
    import { getYjsClientByProjectTitle } from "../../services";
    import { store } from "../../stores/store.svelte";
    import { yjsStore } from "../../stores/yjsStore.svelte";
    import { resolvePath } from "../../utils/pathUtils";
    import { projectCalendarPath, projectGridPath, projectSchedulePath, projectTablePath } from "../../lib/managementPaths";
    import {
        duplicateObjects,
        previewObjectDuplication,
        rollbackObjectDuplication,
        type DuplicableObject,
        type DuplicationPreview,
        type DuplicationScope,
    } from "../../services/yjstable/objectDuplication";

    let {
        sourceDoc,
        sourceProject,
        object,
        onclose,
        destinationPageId: fixedDestinationPageId,
    }: {
        sourceDoc: Y.Doc;
        sourceProject: string;
        object: DuplicableObject;
        onclose: () => void;
        destinationPageId?: string;
    } = $props();

    const scopes: { value: DuplicationScope; label: string; }[] = [
        { value: "item-only", label: "This item only" },
        { value: "referenced", label: "Include referenced items" },
        { value: "referencing", label: "Include items referencing this" },
        { value: "connected", label: "Include all connected items" },
    ];

    function initialDestinationProject(): string {
        return sourceProject;
    }

    function initialDestinationPage(): string {
        return fixedDestinationPageId ?? "";
    }

    let scope = $state<DuplicationScope>("item-only");
    let destinationProject = $state(initialDestinationProject());
    let destinationPageId = $state(initialDestinationPage());
    let copyTableData = $state(false);
    let isDuplicating = $state(false);
    let actionError = $state<string | undefined>(undefined);
    let preview = $derived<DuplicationPreview>(previewObjectDuplication(sourceDoc, object, scope));

    async function executeDuplication() {
        const destinationTitle = destinationProject.trim();
        if (!destinationTitle) return;
        isDuplicating = true;
        actionError = undefined;
        // Captured before any `store.project` reassignment below: when a
        // caller (e.g. Sidebar.svelte) binds `sourceDoc={store.project.ydoc}`
        // reactively, publishing a different project there mid-function would
        // otherwise silently swap this prop's value out from under the rest
        // of this call.
        const capturedSourceDoc = sourceDoc;
        try {
            let destinationDoc = capturedSourceDoc;
            let destinationClient: Awaited<ReturnType<typeof getYjsClientByProjectTitle>> | undefined;
            if (destinationTitle !== sourceProject) {
                destinationClient = await getYjsClientByProjectTitle(destinationTitle);
                if (!destinationClient) throw new Error(`Project "${destinationTitle}" could not be opened.`);
                destinationDoc = destinationClient.project.ydoc;
            }
            const result = await duplicateObjects(capturedSourceDoc, destinationDoc, object, scope, {
                copyTableData,
                synchronizeTableSubdocs: true,
            });
            if (object.type === "grid" && destinationTitle === sourceProject && destinationPageId) {
                try {
                    appendGridPlacement(
                        destinationDoc,
                        destinationPageId,
                        result.primaryId,
                        userManager.getCurrentUser()?.id ?? "anonymous",
                    );
                } catch (error) {
                    rollbackObjectDuplication(destinationDoc, result);
                    throw error;
                }
            }
            if (destinationClient) {
                // Publish only now that duplication actually succeeded: the
                // `[project]` layout only loads a project when no client is
                // registered yet (see AuthenticatedHome.svelte's project
                // switch), so the destination's client/project must be
                // published before the `goto` below or that route would keep
                // rendering the source project's data under the new URL —
                // but publishing any earlier would leave the app pointed at
                // the destination while the address bar (and a failure path)
                // still said source.
                yjsStore.yjsClient = destinationClient as unknown as NonNullable<typeof yjsStore.yjsClient>;
                store.project = destinationClient.project as unknown as NonNullable<typeof store.project>;
            }
            const destinationPath = object.type === "grid"
                ? projectGridPath(destinationTitle, result.primaryId)
                : object.type === "table"
                ? projectTablePath(destinationTitle, result.primaryId)
                : object.type === "calendar"
                ? projectCalendarPath(destinationTitle, result.primaryId)
                : projectSchedulePath(destinationTitle, result.primaryId);
            await goto(resolvePath(destinationPath));
            onclose();
        } catch (error) {
            actionError = error instanceof Error ? error.message : "Duplication failed.";
        } finally {
            isDuplicating = false;
        }
    }
</script>

<div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="duplicate-dialog-title"
    data-testid="object-duplication-dialog"
>
    <div class="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div class="border-b border-gray-200 px-6 py-4">
            <h2 id="duplicate-dialog-title" class="text-lg font-bold text-gray-900">
                Duplicate {
                    object.type === "grid"
                        ? "Grid"
                        : object.type === "table"
                        ? "Table"
                        : object.type === "calendar"
                        ? "Calendar"
                        : "Schedule"
                }
            </h2>
        </div>
        <div class="space-y-4 px-6 py-4">
            <label class="block text-sm font-medium text-gray-700">
                Destination project
                <input
                    class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                    bind:value={destinationProject}
                    disabled={isDuplicating}
                />
            </label>
            {#if object.type === "grid" && destinationProject.trim() === sourceProject}
                <label class="block text-sm font-medium text-gray-700">
                    Destination Page
                    <select
                        class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                        bind:value={destinationPageId}
                        disabled={isDuplicating || fixedDestinationPageId !== undefined}
                        data-testid="duplicate-destination-page"
                    >
                        <option value="">Do not attach to a Page</option>
                        {#each Array.from(Project.fromDoc(sourceDoc).items) as page (page.id)}
                            <option value={page.id}>{page.text || "Untitled Page"}</option>
                        {/each}
                    </select>
                </label>
            {/if}
            <label class="block text-sm font-medium text-gray-700">
                Duplication scope
                <select
                    class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                    bind:value={scope}
                    disabled={isDuplicating}
                >
                    {#each scopes as option (option.value)}
                        <option value={option.value}>{option.label}</option>
                    {/each}
                </select>
            </label>
            {#if preview.objects.some(o => o.type === "table")}
                <label class="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" bind:checked={copyTableData} disabled={isDuplicating} />
                    Copy table rows/data
                </label>
            {/if}
            <div class="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                {preview.objects.length} {preview.objects.length === 1 ? "object" : "objects"} will be duplicated.
            </div>
            {#if preview.omittedReferenceCount > 0}
                <div class="rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800" role="alert">
                    {preview.omittedReferenceCount}
                    {preview.omittedReferenceCount === 1 ? " reference is" : " references are"} outside this scope.
                    In another project, those references will be removed and will not point back to the source project.
                </div>
            {/if}
            {#if actionError}
                <div class="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
                    {actionError}
                </div>
            {/if}
        </div>
        <div class="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
            <button class="rounded border border-gray-300 px-4 py-2 text-sm" onclick={onclose} disabled={isDuplicating}>
                Cancel
            </button>
            <button
                class="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                onclick={executeDuplication}
                disabled={isDuplicating || !destinationProject.trim()}
            >
                {isDuplicating ? "Duplicating…" : "Duplicate"}
            </button>
        </div>
    </div>
</div>
