<script lang="ts">
    // Object Manager's `Duplicate selected` (issue #5153): the current
    // selection is the authoritative duplication scope. Unlike the
    // single-object `ObjectDuplicationDialog`, this never asks for a
    // dependency scope (referenced/referencing/connected) — that concept
    // belongs to building the selection via `Select related`, before this
    // dialog ever opens.
    import { goto } from "$app/navigation";
    import type { Project } from "$shared/app-schema";
    import { userManager } from "../../auth/UserManager";
    import { getYjsClientByProjectTitle } from "../../services";
    import { projectObjectsPath } from "../../lib/managementPaths";
    import { resolvePath } from "../../utils/pathUtils";
    import { yjsStore } from "../../stores/yjsStore.svelte";
    import { store } from "../../stores/store.svelte";
    import { appendGridPlacement } from "../../services/yjstable/gridPlacement";
    import {
        buildDuplicationSetPreview,
        duplicateSelectedObjects,
        type DuplicationSetPreview,
        type DuplicationSideEffect,
        type NamedObject,
    } from "../../services/objectManager/objectManagerController";
    import type { DuplicationSetResult } from "../../services/yjstable/objectDuplication";

    let {
        project,
        sourceProject,
        selected,
        hiddenSelectedCount,
        onclose,
        onDuplicated,
    }: {
        project: Project;
        sourceProject: string;
        /** The exact snapshotted selection, including objects hidden by the current filter (issue #5153 §7). */
        selected: NamedObject[];
        hiddenSelectedCount: number;
        onclose: () => void;
        onDuplicated: (result: DuplicationSetResult, destinationProject: string) => void;
    } = $props();

    function initialDestinationProject(): string {
        return sourceProject;
    }

    let destinationProject = $state(initialDestinationProject());
    let destinationPageId = $state("");
    let copyTableData = $state(false);
    let isDuplicating = $state(false);
    let actionError = $state<string | undefined>(undefined);
    let preview = $derived<DuplicationSetPreview | null>(buildDuplicationSetPreview(project, selected));
    let sameProject = $derived(destinationProject.trim() === sourceProject);
    let typeBreakdown = $derived(
        preview
            ? Object.entries(preview.countsByType)
                .map(([type, count]) => `${count} ${type}${count === 1 ? "" : "s"}`)
                .join(", ")
            : "",
    );
    // Destination-Page placement (issue #5153 §5, "where applicable") only has
    // one unambiguous target when the whole selection duplicates to exactly
    // one Grid in the same project — otherwise there is no single Page to
    // offer, so the option stays hidden rather than guessing.
    let singleGridSameProject = $derived(
        sameProject && preview !== null && preview.objects.length === 1 && preview.objects[0]?.type === "Grid",
    );

    /** Attach the one copied Grid to a destination Page, folded into the same undo step as the duplicate itself. */
    function afterMaterialize(result: DuplicationSetResult): DuplicationSideEffect | void {
        if (!singleGridSameProject || !destinationPageId) return;
        const gridId = result.createdObjects.find(object => object.type === "grid")?.id;
        if (!gridId) return;
        const authorId = userManager.getCurrentUser()?.id ?? "anonymous";
        let placement = appendGridPlacement(project.ydoc, destinationPageId, gridId, authorId);
        return {
            undo: () => placement.delete(),
            redo: () => {
                placement = appendGridPlacement(project.ydoc, destinationPageId, gridId, authorId);
            },
        };
    }

    async function executeDuplication() {
        if (!preview || preview.objects.length === 0) return;
        const destinationTitle = destinationProject.trim();
        if (!destinationTitle) return;
        isDuplicating = true;
        actionError = undefined;
        // Captured before any `store.project` reassignment below: `project` is
        // a reactive prop bound to `ObjectManagerView`'s own `store.project`
        // derivation, so publishing a different project there mid-function
        // would otherwise silently swap `project.ydoc` out from under this
        // call's remaining source-doc reads.
        const sourceDoc = project.ydoc;
        try {
            let destinationDoc = sourceDoc;
            let destinationClient: Awaited<ReturnType<typeof getYjsClientByProjectTitle>> | undefined;
            if (destinationTitle !== sourceProject) {
                destinationClient = await getYjsClientByProjectTitle(destinationTitle);
                if (!destinationClient) throw new Error(`Project "${destinationTitle}" could not be opened.`);
                destinationDoc = destinationClient.project.ydoc;
            }
            const result = await duplicateSelectedObjects(sourceDoc, destinationDoc, selected, {
                copyTableData,
                synchronizeTableSubdocs: true,
                afterMaterialize,
            });
            if (!result) throw new Error("Nothing was selected to duplicate.");
            onDuplicated(result, destinationTitle);
            if (destinationTitle !== sourceProject && destinationClient) {
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
                const ids = result.createdObjects.map(object => object.id);
                await goto(
                    resolvePath(`${projectObjectsPath(destinationTitle)}?selected=${encodeURIComponent(ids.join(","))}`),
                );
            }
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
    aria-labelledby="duplicate-selected-dialog-title"
    data-testid="object-manager-duplicate-dialog"
>
    <div class="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div class="border-b border-gray-200 px-6 py-4">
            <h2 id="duplicate-selected-dialog-title" class="text-lg font-bold text-gray-900">
                Duplicate selected ({selected.length})
            </h2>
        </div>
        <div class="space-y-4 px-6 py-4">
            <label class="block text-sm font-medium text-gray-700">
                Destination project
                <input
                    class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                    bind:value={destinationProject}
                    disabled={isDuplicating}
                    data-testid="object-manager-duplicate-destination-project"
                />
            </label>
            {#if singleGridSameProject}
                <label class="block text-sm font-medium text-gray-700">
                    Destination Page
                    <select
                        class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                        bind:value={destinationPageId}
                        disabled={isDuplicating}
                        data-testid="object-manager-duplicate-destination-page"
                    >
                        <option value="">Do not attach to a Page</option>
                        {#each Array.from(project.items) as page (page.id)}
                            <option value={page.id}>{page.text || "Untitled Page"}</option>
                        {/each}
                    </select>
                </label>
            {/if}
            {#if preview && preview.objects.some(o => o.type === "Table")}
                <label class="flex items-center gap-2 text-sm text-gray-700">
                    <input
                        type="checkbox"
                        bind:checked={copyTableData}
                        disabled={isDuplicating}
                        data-testid="object-manager-duplicate-copy-data"
                    />
                    Copy table rows/data (applies to every selected Table)
                </label>
            {/if}
            {#if preview}
                <div
                    class="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800"
                    data-testid="object-manager-duplicate-preview-count"
                >
                    {preview.objects.length} {preview.objects.length === 1 ? "object" : "objects"} will be duplicated{typeBreakdown ? ` (${typeBreakdown})` : ""}.
                    Destination: {destinationProject.trim() || "—"}.
                </div>
            {/if}
            {#if hiddenSelectedCount > 0}
                <div
                    class="rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800"
                    role="status"
                    data-testid="object-manager-duplicate-hidden-warning"
                >
                    {hiddenSelectedCount} selected {hiddenSelectedCount === 1 ? "object is" : "objects are"} hidden by
                    the current filter and will still be duplicated.
                </div>
            {/if}
            {#if preview && preview.omittedReferenceCount > 0}
                <div
                    class="rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800"
                    role="alert"
                    data-testid="object-manager-duplicate-omitted-warning"
                >
                    {preview.omittedReferenceCount}
                    {preview.omittedReferenceCount === 1 ? " reference points" : " references point"} outside this
                    selection.
                    {#if sameProject}
                        Duplicating within the same project, those copies will keep pointing at the original objects.
                    {:else}
                        Duplicating into another project, those references will be cleared and will not point back
                        to the source project.
                    {/if}
                </div>
            {/if}
            {#if actionError}
                <div class="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
                    {actionError}
                </div>
            {/if}
        </div>
        <div class="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
            <button
                class="rounded border border-gray-300 px-4 py-2 text-sm"
                onclick={onclose}
                disabled={isDuplicating}
                data-testid="object-manager-duplicate-cancel"
            >
                Cancel
            </button>
            <button
                class="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                onclick={executeDuplication}
                disabled={isDuplicating || !destinationProject.trim() || !preview || preview.objects.length === 0}
                data-testid="object-manager-duplicate-apply"
            >
                {isDuplicating ? "Duplicating…" : "Duplicate"}
            </button>
        </div>
    </div>
</div>
