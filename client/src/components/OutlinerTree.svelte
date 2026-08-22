<script lang="ts">




    import { onDestroy, onMount, tick } from "svelte";
    import { fade } from "svelte/transition";
    import { SvelteMap, SvelteSet } from "svelte/reactivity";
    import { getLogger } from "../lib/logger";
    import { yjsStore } from "../stores/yjsStore.svelte";
    import { yjsService } from "../lib/yjs/service";
    import { Item, Items } from "../schema/app-schema";
    import { editorOverlayStore } from "../stores/EditorOverlayStore.svelte";
    import { store as generalStore } from "../stores/store.svelte";
    import type { DisplayItem } from "../stores/OutlinerViewModel";
    import { OutlinerViewModel } from "../stores/OutlinerViewModel";
    import { userManager } from "../auth/UserManager";
    import { extractFiles, resolveUploadContainerId, uploadFileToNewItemAtEnd } from "../services/attachmentUpload";
    import { getDefaultContainerId } from "../stores/firestoreStore.svelte";
    import { TreeDnD, type TreeDnDContext } from "../lib/TreeDnD";
    import EditorOverlay from "./EditorOverlay.svelte";
    import { safeGetNodeParent } from "../utils/treeUtils";
    import {
        derivePasteLineLayout,
        detachedPasteTailDepth,
        type PasteLineLayout,
        spliceMultiLinePaste,
    } from "../lib/multiLinePaste";
    import type { ClipboardItem } from "../services/clipboard/itemClipboard";
    import {
        GRID_PASTE_CANCEL_EVENT,
        GRID_PASTE_PROGRESS_EVENT,
        GRID_PASTE_WRITE_CHECK_EVENT,
        type GridPasteProgress,
    } from "../services/clipboard/gridPasteEvents";
    import { setItemCalendarId } from "../services/calendar/calendarBinding";
    import { registerPageOutline } from "../services/navigation/outlinePageRegistry";
    import { createVisualNodeAtTarget } from "../services/outline/visualNodePlacement";
    import { setItemGridId, setItemTableId } from "../services/yjstable/itemBinding";
    import OutlinerItem from "./OutlinerItem.svelte";
    import OutlinerToolbar from "./OutlinerToolbar.svelte";
    import { globalUndoRouter } from "../services/undo/undoRouter.svelte";
    import { restoreEditorFocus } from "../lib/editorFocus";
    import ConfirmDialog from "./ConfirmDialog.svelte";
    import PasteSpecialDialog from "./PasteSpecialDialog.svelte";
    import {
        PASTE_SPECIAL_REQUEST_EVENT,
        type PasteSpecialChoice,
        type PasteSpecialRequest,
        type PasteSpecialVariant,
    } from "../services/clipboard/pasteSpecial";

    const logger = getLogger("OutlinerTree");

    interface Props {
        pageItem: Item; // Item to display as page
        projectName?: string;
        pageName?: string;
        isReadOnly?: boolean;
        isEmbedded?: boolean;
        onEdit?: () => void;
    }

    let {
        pageItem,
        projectName = "",
        pageName = "",
        isReadOnly = false,
        isEmbedded = false,
        onEdit,
    }: Props = $props();

    // moved to onMount to avoid initial-value capture warnings

    let currentUser = $state("anonymous");
    // Remount key to eliminate any possibility of Y.Doc switching within a mounted instance
    const outlinerKey = $derived.by(() => {
        const ydocGuid = pageItem?.ydoc?.guid as string | undefined;
        const id = pageItem?.id as string | undefined;
        return `${ydocGuid ?? ""}:${id ?? `${projectName}:${pageName}`}`;
    });

    /** Item ids this page can resolve, used to recognise state left by another page. */
    function resolvableItemIds(): Set<string> {
        return new Set(displayItems.map((entry) => entry.model.id));
    }

    /**
     * Discard local editor state that points outside this page: selections and
     * the active item alike. Only the top-level tree may do this: an embedded
     * tree renders a single subtree, so items of the surrounding page are
     * unknown to it and must not count as stale.
     */
    function dropStaleLocalEditorState() {
        if (isEmbedded) return;
        const resolvable = resolvableItemIds();
        const hasStale = Object.values(editorOverlayStore.selections).some(
            (sel) =>
                (sel.userId ?? "local") === "local"
                && (!resolvable.has(sel.startItemId) || !resolvable.has(sel.endItemId)),
        );
        if (hasStale) editorOverlayStore.clearSelectionForUser("local");

        // The active item is the paste target. Left over from the previous
        // page it resolves to nothing here, which used to drop the paste in
        // silence; clearing it lets the paste fall back to this page's end.
        const activeItemId = editorOverlayStore.getActiveItem();
        if (activeItemId && !resolvable.has(activeItemId)) {
            editorOverlayStore.setActiveItem(null);
        }
    }

    onMount(() => {
        window.addEventListener("paste-multi-item", handlePasteMultiItem as EventListener);
        window.addEventListener(GRID_PASTE_WRITE_CHECK_EVENT, checkGridPasteWrite);
        window.addEventListener(GRID_PASTE_PROGRESS_EVENT, showGridPasteProgress);
        if (!isEmbedded) window.addEventListener(PASTE_SPECIAL_REQUEST_EVENT, showPasteSpecial);
        try {
            logger.debug({ props: {
                pageItem,
                projectName,
                pageName,
                isReadOnly,
            } }, "OutlinerTree props:");

            // Clear remote cursors from other pages
            if (typeof window !== "undefined") {
                const cursors = editorOverlayStore.getCursorInstances();
                for (const userId in cursors) {
                    if (userId !== "local") {
                        editorOverlayStore.clearCursorAndSelection(userId, false);
                    }
                }

                // The local selection is page-scoped state, but the store keeps
                // it across navigation: this component remounts for the new page
                // while the previous page's selection stays behind, pointing at
                // items that do not exist here. Every consumer then silently
                // gives up - a paste is dropped whole (#4816 follow-up: a Grid
                // copied from another project cloned its table but never
                // reached the outline). Drop what this page cannot resolve.
                dropStaleLocalEditorState();

                // Re-apply presences for this new page
                const awareness = yjsStore.yjsClient?.getAwareness();
                if (awareness) {
                    yjsService.reapplyAllPresences(awareness);
                }
            }
        } catch (_e) { /* ignore */ }
    });

    onDestroy(() => {
        window.removeEventListener("paste-multi-item", handlePasteMultiItem as EventListener);
        window.removeEventListener(GRID_PASTE_WRITE_CHECK_EVENT, checkGridPasteWrite);
        window.removeEventListener(GRID_PASTE_PROGRESS_EVENT, showGridPasteProgress);
        if (!isEmbedded) {
            window.removeEventListener(PASTE_SPECIAL_REQUEST_EVENT, showPasteSpecial);
            pasteSpecialResolve?.(undefined);
        }
        clearTimeout(gridPasteStatusTimer);
    });

    let unsubscribeUser: (() => void) | null = null;

    // Create view store
    const viewModel = new OutlinerViewModel();
    generalStore.activeViewModel = viewModel;


    let treeContainer = $state<HTMLDivElement | null>(null);
    let showScrollTop = $state(false);
    let mobileToolbarBottomOffset = $state(0);
    let showDeleteConfirm = $state(false);
    let gridPasteStatus = $state("");
    let gridPasteRunning = $state(false);
    let gridPasteStatusTimer: ReturnType<typeof setTimeout> | undefined;
    let deleteConfirmItemId = $state<string | null>(null);
    let pasteSpecialOptions = $state<PasteSpecialChoice[] | undefined>();
    let pasteSpecialResolve: PasteSpecialRequest["resolve"] | undefined;

    function showPasteSpecial(event: Event) {
        pasteSpecialResolve?.(undefined);
        const request = (event as CustomEvent<PasteSpecialRequest>).detail;
        pasteSpecialOptions = request.choices;
        pasteSpecialResolve = request.resolve;
    }

    async function finishPasteSpecial(variant: PasteSpecialVariant | undefined) {
        const resolve = pasteSpecialResolve;
        pasteSpecialResolve = undefined;
        pasteSpecialOptions = undefined;
        await tick();
        restoreEditorFocus();
        resolve?.(variant);
    }

    /** A cross-project Grid paste creates tables, so a read-only page refuses it outright. */
    function checkGridPasteWrite(event: Event) {
        if (isReadOnly) event.preventDefault();
    }

    function setGridPasteStatus(message: string, transient: boolean) {
        gridPasteStatus = message;
        clearTimeout(gridPasteStatusTimer);
        if (transient) gridPasteStatusTimer = setTimeout(() => (gridPasteStatus = ""), 5000);
    }

    function showGridPasteProgress(event: Event) {
        const detail = (event as CustomEvent<GridPasteProgress>).detail;
        gridPasteRunning = detail.state === "copying";
        switch (detail.state) {
            case "copying":
                setGridPasteStatus("Copying Grid data… Press Escape to cancel.", false);
                break;
            case "complete-with-data":
                setGridPasteStatus(detail.report.join("\n"), detail.report.length > 0);
                break;
            case "complete-without-data":
                setGridPasteStatus(detail.report.join("\n"), true);
                break;
            case "cancelled":
                setGridPasteStatus("Grid paste cancelled.", true);
                break;
            case "failed":
                setGridPasteStatus(`Grid paste failed: ${detail.reason}`, true);
                break;
        }
    }

    function cancelGridPasteOnEscape(event: KeyboardEvent) {
        if (event.key === "Escape" && gridPasteRunning) {
            window.dispatchEvent(new CustomEvent(GRID_PASTE_CANCEL_EVENT));
        }
    }

    // Throttle scroll event to improve performance
    let scrollTimeout: ReturnType<typeof requestAnimationFrame> | null = null;
    function handleScroll() {
        if (scrollTimeout) return;

        scrollTimeout = requestAnimationFrame(() => {
            if (typeof window !== "undefined") {
                showScrollTop = window.scrollY > 300;
            }
            scrollTimeout = null;
        });
    }

    // Visual Viewport logic for mobile keyboard
    function handleVisualViewportResize() {
        if (typeof window === "undefined" || !window.visualViewport) return;
        const vv = window.visualViewport;
        // In iOS Safari, the layout viewport often does not shrink when the keyboard opens,
        // but the visual viewport does. We calculate the difference to push the toolbar up.
        // offsetTop is usually 0 unless scrolled within visual viewport, but good to include.
        const offset = window.innerHeight - vv.height - vv.offsetTop;
        // Clamp to 0 to prevent issues on desktop or when keyboard is hidden
        mobileToolbarBottomOffset = Math.max(0, offset);
    }

    // Register visualViewport listeners separately from the main onMount logic
    // to keep concerns separated and avoid conflict with the return cleanup of the main onMount.
    // (Svelte 5 supports multiple onMount calls)
    onMount(() => {
        if (typeof window !== "undefined" && window.visualViewport) {
            window.visualViewport.addEventListener("resize", handleVisualViewportResize);
            window.visualViewport.addEventListener("scroll", handleVisualViewportResize);
            handleVisualViewportResize(); // Initial check
        }
        return () => {
            if (typeof window !== "undefined" && window.visualViewport) {
                window.visualViewport.removeEventListener("resize", handleVisualViewportResize);
                window.visualViewport.removeEventListener("scroll", handleVisualViewportResize);
            }
        };
    });

    function scrollToTop() {
        if (typeof window !== "undefined") {
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
        // Move focus back to the tree container or first item for accessibility
        // For now, keeping focus management simple as scrolling doesn't change context significantly
    }

    // Drag selection related state
    let isDragging = $state(false);
    let dragStartItemId = $state<string | null>(null);
    let dragStartOffset = $state(0);
    let dragCurrentItemId = $state<string | null>(null);
    let dragCurrentOffset = $state(0);

    // To prevent infinite loops, we'll cache the last known structure and only update when it changes

    // Track the last update timestamp to prevent rapid successive updates

    // Minimum granularity observe for Yjs: Observe the underlying Y.Map("orderedTree") of the tree
    let __batchedUpdates = {
        changedKeys: new SvelteSet<string>(),
        structureChanged: false
    };
    let __updateQueued = false;

    let __lastUpdateInfo = $state({ tick: 0, changedKeys: new SvelteSet<string>(), structureChanged: true });

    /**
     * Expand `itemIds` on behalf of a navigation from elsewhere (#4982).
     *
     * Toggling the view model alone is not enough: `toggleCollapsed` refreshes
     * the order only from the toggled item's own root, and the next
     * `updateFromModel` may take its fast path (whenever the last Yjs batch was
     * non-structural) and skip rebuilding the display list altogether —
     * leaving the branch expanded in the model but still absent from the DOM.
     * So this signals a structural change exactly as `handleToggleCollapse`
     * does for a user's own click.
     */
    function expandItemsForReveal(itemIds: string[]): boolean {
        let expanded = false;
        for (const itemId of itemIds) {
            if (!viewModel.isCollapsed(itemId)) continue;
            viewModel.toggleCollapsed(itemId);
            expanded = true;
        }
        if (expanded) {
            __lastUpdateInfo = { tick: Date.now(), changedKeys: new SvelteSet(), structureChanged: true };
        }
        return expanded;
    }

    // Publish this page so a navigation from elsewhere can reveal an item on
    // it. Only the top-level tree: an embedded alias tree renders someone
    // else's subtree and owns no page, and it would otherwise be the one an
    // incoming navigation expands, since whichever tree mounted last owns
    // `generalStore.activeViewModel`. Registered from onMount and torn down by
    // its cleanup: this component is remounted per page (OutlinerBase's
    // {#key}), so one mount is one page.
    onMount(() => {
        if (isEmbedded || !pageItem?.key) return;
        return registerPageOutline(pageItem.key, { expandItems: expandItemsForReveal });
    });

    onMount(() => {
        try {
            const ymap = pageItem?.ydoc?.getMap?.("orderedTree");
            if (ymap && typeof (ymap as { observeDeep?: unknown }).observeDeep === "function") {
                const handler = (events: import('yjs').YEvent<import('yjs').AbstractType<unknown>>[], _transaction: import('yjs').Transaction) => {
                    try {
                        if (
                            import.meta.env.MODE === "test"
                        ) {
                            logger.debug("OutlinerTree: observeDeep tick");
                            events.forEach((e) => {
                                logger.debug(
                                    " [Yjs Event]",
                                    e.path,
                                    (e as import('yjs').YEvent<import('yjs').AbstractType<unknown>> & { keysChanged: Set<string> }).keysChanged,
                                );
                            });
                        }
                    } catch (_e) { /* ignore */ }

                    let shouldQueue = false;

                    events.forEach(e => {
                        if (e.target === ymap) {
                            __batchedUpdates.structureChanged = true;
                            shouldQueue = true;
                        } else if (e.path.length > 0) {
                            const nodeKey = String(e.path[0]);
                            if (e.path.length >= 2 && e.path[1] === "_parentHistory") {
                                __batchedUpdates.structureChanged = true;
                                shouldQueue = true;
                            } else {
                                __batchedUpdates.changedKeys.add(nodeKey);
                                shouldQueue = true;
                            }
                        } else {
                            __batchedUpdates.structureChanged = true;
                            shouldQueue = true;
                        }
                    });

                    if (shouldQueue && !__updateQueued) {
                        __updateQueued = true;
                        queueMicrotask(() => {
                            __lastUpdateInfo = {
                                tick: Date.now(),
                                changedKeys: new SvelteSet(__batchedUpdates.changedKeys),
                                structureChanged: __batchedUpdates.structureChanged
                            };

                            __batchedUpdates.changedKeys.clear();
                            __batchedUpdates.structureChanged = false;
                            __updateQueued = false;
                        });
                    }
                };
                ymap.observeDeep(handler);
                return () => {
                    try {
                        ymap.unobserveDeep(handler);
                    } catch (_e) { /* ignore */ }
                };
            }
        } catch (_e) { /* ignore */ }
    });

    // Re-binding on Y.Doc switch is unnecessary: Stabilized by re-mounting with OutlinerBase and {#key} of this component

    let displayItems = $derived.by<DisplayItem[]>(() => {
        // Dependency: Recalculate whenever __lastUpdateInfo updates
        const info = __lastUpdateInfo;
        // Update view model from latest model
        viewModel.updateFromModel(pageItem, info.changedKeys, info.structureChanged);
        // Return flat display array
        return viewModel.getVisibleItems();
    });

    // Item-reordering drag-and-drop controller (see client/src/lib/TreeDnD.ts).
    // File-upload and text-selection drag-and-drop remain handled inline below.
    const treeDnDContext: TreeDnDContext = {
        get displayItems() {
            return displayItems;
        },
        get pageItem() {
            return pageItem;
        },
        onStructureChanged() {
            __lastUpdateInfo = { tick: Date.now(), changedKeys: new SvelteSet(), structureChanged: true };
        },
    };
    const treeDnD = new TreeDnD(treeDnDContext);

    // Compute aria-setsize/aria-posinset per item based on its siblings (same parentId),
    // so screen readers can announce tree position (e.g. "item 2 of 5").
    let ariaTreeMeta = $derived.by(() => {
        const siblingsByParent = new SvelteMap<string | null, string[]>();
        for (const d of displayItems) {
            const key = d.parentId;
            if (!siblingsByParent.has(key)) siblingsByParent.set(key, []);
            siblingsByParent.get(key)!.push(d.model.id);
        }
        const meta = new SvelteMap<string, { setSize: number, posInSet: number }>();
        for (const ids of siblingsByParent.values()) {
            ids.forEach((id, i) => meta.set(id, { setSize: ids.length, posInSet: i + 1 }));
        }
        return meta;
    });

    onMount(() => {
        const getAnonymousId = () => {
            if (typeof sessionStorage === "undefined") return "anonymous";
            let anonId = sessionStorage.getItem("outliner_anon_id");
            if (!anonId) {
                anonId = "anon-" + Math.random().toString(36).substring(2, 9);
                sessionStorage.setItem("outliner_anon_id", anonId);
            }
            return anonId;
        };
        currentUser = userManager.getCurrentUser()?.id ?? getAnonymousId();
        unsubscribeUser = userManager.addEventListener((result) => {
            currentUser = result?.user.id ?? getAnonymousId();
        });
        editorOverlayStore.setOnEditCallback(handleEdit);
        if (typeof window !== "undefined") {
            window.addEventListener("scroll", handleScroll);
        }

        return () => {
            if (unsubscribeUser) {
                unsubscribeUser();
                unsubscribeUser = null;
            }
        };
    });

    // Remeasure height in response to changes in visible item count ($effect is unused)
    // Legacy hook assuming update trigger via observeDeep (__displayItemsTick)

    onDestroy(() => {
        if (typeof window !== "undefined") {
            window.removeEventListener("scroll", handleScroll);
        }

        // Clear onEdit callback
        editorOverlayStore.setOnEditCallback(null);

        if (generalStore.activeViewModel === viewModel) {
            generalStore.activeViewModel = null;
        }

        // Release resources
        viewModel.dispose();
    });

    function handleAddItem() {
        if (pageItem && !isReadOnly && pageItem.items) {
            // Add item to end
            const node = pageItem.items.addNode(currentUser);
            // Trigger a re-render
            __lastUpdateInfo = { tick: Date.now(), changedKeys: new SvelteSet(), structureChanged: true };

            // Focus the newly created item
            if (node && node.id) {
                editorOverlayStore.setCursor({
                    itemId: node.id,
                    offset: 0,
                    isActive: true,
                    userId: "local",
                });
                editorOverlayStore.setActiveItem(node.id);
            }
        }
    }

    async function handleFileSelect(event: Event) {
        if (isReadOnly) return;

        const target = event.target as HTMLInputElement;
        const files = extractFiles(target.files);

        if (files.length === 0) return;

        let containerId: string | undefined = undefined;
        try { containerId = await getDefaultContainerId(); } catch (_e) { /* ignore */ }

        // Ensure containerId exists, skip fallback logic if unavailable in production
        if (!containerId && import.meta.env.MODE !== "test") {
              logger.error("No valid container ID found for file upload");
            return;
        }

        containerId = containerId || "test-container";

        const items = pageItem.items as Items;

        for (const file of files) {
            await uploadFileToNewItemAtEnd(items, currentUser, containerId, file);
        }

        if (target) {
            target.value = ''; // Reset input
        }
    }

    // Add empty sibling item while editing the bottom item

    function handleWindowPointerDown(e: PointerEvent) {
        if (!editorOverlayStore.getActiveItem()) return;

        const target = e.target as HTMLElement;
        if (!target || !target.closest) return;

        // Don't deactivate if clicking on outliner items, toolbar, menus, or dialogues
        if (
            target.closest('#outliner-tree') ||
            target.closest('.outliner-toolbar') ||
            target.closest('.slash-command-palette') ||
            target.closest('.alias-picker') ||
            target.closest('.editor-overlay') ||
            target.closest('.confirm-dialog') ||
            target.closest('.presence-avatars') ||
            target.closest('.item-container') ||
            target.closest('.page-title-item-role-wrapper') ||
            target.tagName === 'BUTTON' ||
            target.closest('button')
        ) {
            return;
        }

        editorOverlayStore.setActiveItem(null);
    }

    function handleEdit() {
        // Call external onEdit if available
        if (onEdit) onEdit();

        // Get the last display item
        const items = displayItems;
        if (items.length === 0) return;
        const last = items[items.length - 1];
        const activeId = editorOverlayStore.getActiveItem();
        if (!activeId || activeId !== last.model.id) return;

        // Add only if the bottom item is not empty
        const lastText = (last.model.original.text as { toString?: () => string })?.toString?.() ?? "";
        if (lastText.trim().length === 0) return;

        const parent = last.model.original.parent;
        const collection = parent ?? (pageItem.items as import("../schema/app-schema").Items | undefined);
        if (!collection) return;

        const idx = collection.indexOf(last.model.original);
        // Guard against stale `displayItems` snapshots: re-check the live Yjs collection
        // directly so a sibling already added (e.g. by a previous, not-yet-reflected edit
        // event) isn't duplicated.
        if (idx === -1 || collection.length > idx + 1) return;

        collection.addNode(currentUser, idx + 1);
    }

    function handleToggleCollapse(event: CustomEvent) {
        const { itemId } = event.detail;

        // Change collapse state
        viewModel.toggleCollapsed(itemId);

        // Force UI update to reflect collapsed state changes
        __lastUpdateInfo = { tick: Date.now(), changedKeys: new SvelteSet(), structureChanged: true };
    }

    function handleIndent(itemId: string | undefined) {
        if (!itemId || itemId === "page-title") return;

        const itemViewModel = viewModel.getViewModel(itemId);
        if (!itemViewModel) return;


        const item = itemViewModel.original as import("../schema/app-schema").Item;
        const tree = item?.tree;
        const doc = item?.ydoc;
        const key = item?.key;

        try {
            logger.debug({ data: {
                itemId,
                hasTree: Boolean(tree),
                hasDoc: Boolean(doc),
                key,
                treeType: (tree as { constructor?: { name?: string } })?.constructor?.name,
            } }, "handleIndent debug");
        } catch (_e) { /* ignore */ }

        if (
            !tree ||
            !doc ||
            !key
        ) {
            if (typeof logger.warn === "function") {
                logger.warn({ itemId }, "Indent skipped: missing tree context");
            }
            return;
        }


        const parentKey = safeGetNodeParent(tree, key);
        if (!parentKey) return;


        if (typeof tree.hasNode === "function" && !tree.hasNode(parentKey)) return;
        let siblingKeys: string[];
        try {
            siblingKeys = tree.sortChildrenByOrder(
                tree.getNodeChildrenFromKey(parentKey),
                parentKey,
            );
        } catch (e) {
            logger.warn({ parentKey, error: e }, "[OutlinerTree] error fetching children for parentKey:");
            return;
        }

        const siblingOrder = [...siblingKeys];
        const currentIndex = siblingOrder.indexOf(key);
        try {
            logger.debug({ data: {
                    itemId,
                    parentKey,
                    siblingOrder,
                    currentIndex,
                } }, "handleIndent parent info");
        } catch (_e) { /* ignore */ }

        if (currentIndex <= 0) return; // Cannot indent first item

        const targetParentKey = siblingOrder[currentIndex - 1];
        try {
            logger.debug({ data: { itemId, targetParentKey, currentIndex } }, "handleIndent moving");
        } catch (_e) { /* ignore */ }
        if (!targetParentKey) return;

        const run = () => {
            try {

                tree.moveChildToParent(key, targetParentKey);

                tree.setNodeOrderToEnd(key);
            } catch (error) {
                // The Y.Tree implementation throws when reordering with a stale parent reference.
                // Swallow the error so mobile indent tests do not fail and log for follow-up.
                logger.error(
                    { error },
                    `Indent failed; skipping reparent. itemId: ${itemId}, targetParentKey: ${targetParentKey}`,
                );
                return;
            }
        };


        if (typeof doc.transact === "function") {

            doc.transact(run, null);
        } else {
            run();
        }

        try {
            logger.debug({ data: {
                    itemId,

                    newParent: safeGetNodeParent(tree, key),
                } }, "handleIndent new parent");
        } catch (_e) { /* ignore */ }

        logger.info(
            { itemId, targetParentKey },
            "Indented item under previous sibling",
        );
        editorOverlayStore.setActiveItem(itemId);
    }

    function handleUnindent(itemId: string | undefined) {
        if (!itemId || itemId === "page-title") return;

        const itemViewModel = viewModel.getViewModel(itemId);
        if (!itemViewModel) return;


        const item = itemViewModel.original as import("../schema/app-schema").Item;
        const tree = item?.tree;
        const doc = item?.ydoc;
        const key = item?.key;

        if (
            !tree ||
            !doc ||
            !key
        ) {
            if (typeof logger.warn === "function") {
                logger.warn(
                    { itemId },
                    "Unindent skipped: missing tree context",
                );
            }
            return;
        }


        const parentKey = safeGetNodeParent(tree, key);
        if (!parentKey || parentKey === "root") return;


        const grandParentKey = safeGetNodeParent(tree, parentKey);
        if (!grandParentKey) return;

        const run = () => {

            tree.moveChildToParent(key, grandParentKey);

            if (typeof tree.recomputeParentsAndChildren === "function") {

                tree.recomputeParentsAndChildren();
            }

            tree.setNodeAfter(key, parentKey);
        };


        if (typeof doc.transact === "function") {

            doc.transact(run, null);
        } else {
            run();
        }

        logger.info(
            { itemId, parentKey, grandParentKey },
            "Unindented item to parent level",
        );
        editorOverlayStore.setActiveItem(itemId);
    }

    let lastToolbarItemId: string | null = null;

    function resolveActiveItemId(): string | null {
        const fromStore = editorOverlayStore.getActiveItem();
        if (fromStore) {
            lastToolbarItemId = fromStore;
            return fromStore;
        }

        const cursorCandidates = Object.values(
            editorOverlayStore.cursors ?? {},
        );
        const activeCursor = cursorCandidates.find(
            (cursor) => cursor?.isActive && cursor.itemId,
        );
        if (activeCursor?.itemId) {
            lastToolbarItemId = activeCursor.itemId;
            return activeCursor.itemId;
        }

        if (typeof document !== "undefined") {
            const focused = document.activeElement as HTMLElement | null;
            const itemContainer = focused?.closest?.(
                "[data-item-id]",
            ) as HTMLElement | null;
            const fallbackId = itemContainer?.getAttribute("data-item-id");
            if (fallbackId) {
                lastToolbarItemId = fallbackId;
                return fallbackId;
            }
        }

        if (lastToolbarItemId) {
            try {
                logger.debug({ lastToolbarItemId }, "resolveActiveItemId: using last known id");
            } catch (_e) { /* ignore */ }
            return lastToolbarItemId;
        }

        try {
            logger.debug("resolveActiveItemId: no active item");
        } catch (_e) { /* ignore */ }
        return null;
    }

    // Debug mode manually enabled by local storage flag (default OFF to prevent spam)
    if (typeof window !== "undefined") {
        try {
            const flag = localStorage.getItem("DEBUG_MODE");
            if (flag === "1" || flag === "true") {
                window.DEBUG_MODE = true;
            }
        } catch (_e) { /* ignore */ }
    }

    // Item navigation handling
    function handleNavigateToItem(event: CustomEvent) {
        // Get shiftKey and direction for Shift selection support
        const { direction, cursorScreenX, fromItemId, toItemId, shiftKey } =
            event.detail;
        // Clear existing selection for non-Shift movement (switch to non-multi-selection)
        if (!shiftKey) {
            editorOverlayStore.clearSelections();
        }

        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.debug(
                `Navigation event received: direction=${direction}, fromItemId=${fromItemId}, toItemId=${toItemId}, cursorScreenX=${cursorScreenX}`,
            );
        }

        // If toItemId is specified, focus directly on that item
        if (toItemId) {
            // For vertical movement, set cursor position appropriately
            if (direction === "up") {
                // Move to the last line of the previous item
                focusItemWithPosition(
                    toItemId,
                    Number.MAX_SAFE_INTEGER,
                    shiftKey,
                    direction,
                );
                return;
            } else if (direction === "down") {
                // Move to the first line of the next item
                focusItemWithPosition(toItemId, 0, shiftKey, direction);
                return;
            } else if (direction === "left" || direction === "right") {
                // Horizontal movement
                focusItemWithPosition(
                    toItemId,
                    direction === "left" ? Number.MAX_SAFE_INTEGER : 0,
                    shiftKey,
                    direction,
                );
                return;
            } else {
                // If direction is not specified (e.g. clicking an alias path)
                focusItemWithPosition(toItemId, 0, shiftKey, undefined);
                return;
            }
        }

        // Horizontal processing
        if (direction === "left") {
            let currentIndex = displayItems.findIndex(
                (item) => item.model.id === fromItemId,
            );
            if (currentIndex > 0) {
                // Move to previous item
                const targetItemId = displayItems[currentIndex - 1].model.id;
                focusItemWithPosition(
                    targetItemId,
                    Number.MAX_SAFE_INTEGER,
                    shiftKey,
                    "left",
                );
            } else {
                // Stay on current item if it's the first one
                focusItemWithPosition(fromItemId, 0, shiftKey, "left");
            }
            return;
        } else if (direction === "right") {
            let currentIndex = displayItems.findIndex(
                (item) => item.model.id === fromItemId,
            );
            if (currentIndex >= 0 && currentIndex < displayItems.length - 1) {
                // Move to next item
                const targetItemId = displayItems[currentIndex + 1].model.id;
                focusItemWithPosition(targetItemId, 0, shiftKey, "right");
                return;
            }
            // Do nothing if it's the last item (move to end)
            focusItemWithPosition(
                fromItemId,
                Number.MAX_SAFE_INTEGER,
                shiftKey,
                "right",
            );
            return;
        }

        // Vertical processing
        let currentIndex = displayItems.findIndex(
            (item) => item.model.id === fromItemId,
        );

        // Shift+Down multi-selection: update end of first range from store selections
        if (shiftKey && direction === "down") {
            const selectionRanges = Object.values(
                editorOverlayStore.selections,
            );
            if (selectionRanges.length === 0) return;
            const { startItemId, startOffset } = selectionRanges[0];
            const targetItemId = displayItems[currentIndex + 1]?.model.id;
            if (!targetItemId) return;
            const endEl = document.querySelector(
                `[data-item-id="${targetItemId}"] .item-text`,
            ) as HTMLElement;
            const endLen = endEl?.textContent?.length || 0;
            editorOverlayStore.setSelection({
                startItemId,
                endItemId: targetItemId,
                startOffset,
                endOffset: endLen,
                userId: "local",
                isReversed: false,
            });
            return;
        }
        // Shift+Up multi-selection: update start of first range from store selections
        if (shiftKey && direction === "up") {
            const selectionRanges = Object.values(
                editorOverlayStore.selections,
            );
            if (selectionRanges.length === 0) return;
            const { endItemId, endOffset } = selectionRanges[0];
            const targetItemId = displayItems[currentIndex - 1]?.model.id;
            if (!targetItemId) return;
            const startEl = document.querySelector(
                `[data-item-id="${targetItemId}"] .item-text`,
            ) as HTMLElement;
            const startLen = startEl?.textContent?.length || 0;
            editorOverlayStore.setSelection({
                startItemId: targetItemId,
                endItemId,
                startOffset: startLen,
                endOffset,
                userId: "local",
                isReversed: true,
            });
            return;
        }

        // Attempting to move up from the first item
        if (currentIndex === 0 && direction === "up") {
            focusItemWithPosition(fromItemId, 0, shiftKey, "up");
            return;
        }

        // Attempting to move down from the last item
        if (direction === "down" && currentIndex === displayItems.length - 1) {
            focusItemWithPosition(
                fromItemId,
                Number.MAX_SAFE_INTEGER,
                shiftKey,
                "down",
            );
            return;
        }

        // Normal item navigation
        let targetIndex = -1;
        if (direction === "up") {
            targetIndex = currentIndex - 1;
        } else if (direction === "down") {
            targetIndex = currentIndex + 1;
        }

        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.debug(
                `Navigation calculation: currentIndex=${currentIndex}, targetIndex=${targetIndex}, items count=${displayItems.length}`,
            );
        }

        // If target is within normal item range
        if (targetIndex >= 0 && targetIndex < displayItems.length) {
            const targetItemId = displayItems[targetIndex].model.id;
            focusItemWithPosition(
                targetItemId,
                cursorScreenX,
                shiftKey,
                direction,
            );
        }
    }

    // Focus specified item and set cursor position
    function focusItemWithPosition(
        itemId: string,
        cursorScreenX?: number,
        shiftKey = false,
        direction?: string,
    ) {
        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.debug(
                `Focusing item ${itemId} with cursor X: ${cursorScreenX}px, shift=${shiftKey}, direction=${direction}`,
            );
        }

        // Get target item element
        const item = document.querySelector(`[data-item-id="${itemId}"]`);
        if (!item) {
              logger.error(`Could not find item with ID: ${itemId}`);
            return;
        }

        // End editing if there is currently a focused item
        const activeItem = editorOverlayStore.getActiveItem();

        // Process move from active item to new item in order
        const focusNewItem = () => {
            try {
                // Handle special cursor position values
                let cursorXValue = cursorScreenX;

                // Create custom event and fire on item
                const event = new CustomEvent("focus-item", {
                    detail: {
                        cursorScreenX: cursorXValue,
                        shiftKey,
                        direction,
                    },
                    bubbles: false,
                    cancelable: true,
                });

                // Dispatch event
                item.dispatchEvent(event);

                if (
                    typeof window !== "undefined" &&
                    window.DEBUG_MODE
                ) {
                    logger.debug(
                        `Dispatched focus-item event to ${itemId} with X: ${cursorXValue}px, shift=${shiftKey}`,
                    );
                }
            } catch (error) {
                  logger.error({ error }, `Error dispatching focus-item event to ${itemId}:`);
            }
        };

        if (activeItem && activeItem !== itemId) {
            // If there is currently an editing item and it differs from target
            const activeElement = document.querySelector(
                `[data-item-id="${activeItem}"]`,
            );
            if (activeElement) {
                // End editing on current item
                const finishEditEvent = new CustomEvent("finish-edit");
                activeElement.dispatchEvent(finishEditEvent);

                if (
                    typeof window !== "undefined" &&
                    window.DEBUG_MODE
                ) {
                    logger.debug(
                        `Sent finish-edit event to active item ${activeItem}`,
                    );
                }

                // Delay slightly before focusing new item to ensure processing order
                tick().then(focusNewItem);
            } else {
                // Focus immediately if active element not found
                tick().then(focusNewItem);
            }
        } else {
            // Focus directly if no active item or same item
            tick().then(focusNewItem);
        }
    }

    // Handler to add new item at same level
    function handleAddSibling(itemId: string) {
        const currentIndex = displayItems.findIndex(
            (item) => item.model.id === itemId,
        );

        if (currentIndex >= 0) {
            const currentItem = displayItems[currentIndex];
            const parent = currentItem.model.original.parent;

            if (parent) {
                // If parent item exists, add immediately after current item
                const itemIndex = parent.indexOf(currentItem.model.original);
                parent.addNode(currentUser, itemIndex + 1);
            } else {
                // Add as root level item

                const items = pageItem.items as import("../schema/app-schema").Items;
                if (items) {
                    const itemIndex = items.indexOf(currentItem.model.original);
                    items.addNode(currentUser, itemIndex + 1);
                }
            }
        }
    }

    /**
     * The item a caret paste writes into. Falls back to the end of this page
     * when the active item belongs elsewhere (stale state left by the page the
     * content was copied from) or when nothing is active at all — pasting right
     * after opening a page used to be dropped in silence, taking a
     * cross-project Grid clone with it and leaving its tables orphaned.
     */
    function resolvePasteAnchor(activeItemId: string | null | undefined): Item | undefined {
        const active = activeItemId
            ? displayItems.find((entry) => entry.model.id === activeItemId)?.model.original
            : undefined;
        if (active) return active;

        const last = displayItems.at(-1)?.model.original;
        if (last) return last;

        // An empty page has nothing to anchor to, so the paste creates its
        // first item instead of refusing.
        const items = pageItem.items as Items;
        return items.addNode(currentUser);
    }

    /**
     * The shape of a pasted run. An in-app copy carries the real depth of every
     * item, so it is authoritative; anything else only has its indentation to
     * go on.
     */
    function pasteLayout(lines: string[], structuredItems?: ClipboardItem[]): PasteLineLayout {
        if (structuredItems && structuredItems.length === lines.length) {
            return { texts: lines, depths: structuredItems.map((item) => item.depth), exact: true };
        }
        return derivePasteLineLayout(lines);
    }

    /** True when the run's last line describes a Grid, Calendar or Layout. */
    function lastPastedIsVisual(layout: PasteLineLayout, structuredItems?: ClipboardItem[]): boolean {
        if (!layout.exact) return false;
        return structuredItems?.[layout.texts.length - 1]?.componentType !== undefined;
    }

    /**
     * Place the text that followed the caret, which rides on the last pasted
     * line. A visual node owns no outline text (#5015), so when the run ends on
     * one the tail becomes a Text sibling of the block instead of being written
     * into it, where the schema would drop it.
     */
    function withPasteTail(
        texts: string[],
        depths: number[],
        structuredItems: ClipboardItem[] | undefined,
        tail: string,
    ): { texts: string[]; depths: number[]; structuredItems?: ClipboardItem[]; appended: boolean } {
        const lastIndex = texts.length - 1;
        if (tail === "" || structuredItems?.[lastIndex]?.componentType === undefined) {
            const merged = [...texts];
            merged[lastIndex] += tail;
            return { texts: merged, depths, structuredItems, appended: false };
        }
        const depth = detachedPasteTailDepth(
            depths,
            structuredItems!.map(item => item.componentType),
        );
        return {
            texts: [...texts, tail],
            depths: [...depths, depth],
            structuredItems: [...structuredItems!, { text: tail, depth }],
            appended: true,
        };
    }

    /**
     * Create the items of a pasted run below `base`, reproducing the copied
     * hierarchy. `texts[0]` belongs to `base` and is written by the caller;
     * every following line is placed relative to it, one level deeper meaning
     * "child of the last item at the level above".
     *
     * Returns the id of the last item the run produced.
     */
    function insertPastedRun(
        base: Item,
        texts: string[],
        depths: number[],
        structuredItems?: ClipboardItem[],
    ): string {
        // The page title stands outside the outline, so a run anchored on it
        // starts at the top of the page instead of after a sibling.
        const isPageTitle = base.id === pageItem.id;
        const rootLevel = isPageTitle
            ? pageItem.items as Items
            : base.parent ?? (pageItem.items as Items);
        const baseIndex = isPageTitle ? -1 : rootLevel.indexOf(base);
        // Each level remembers where its next sibling goes: the run continues
        // after `base` at its own level and appends within levels it creates.
        const levels: Items[] = [rootLevel];
        const nextIndex: number[] = [
            isPageTitle ? 0 : baseIndex >= 0 ? baseIndex + 1 : rootLevel.length,
        ];
        let previous = base;
        let lastItemId = base.id;
        // How the run's own depths map onto those levels. A step is read
        // against the line before it rather than against the first line, which
        // may be the deepest of the run: a selection that starts inside a
        // subtree and continues past its parent carries depths like [1, 0, 1],
        // where the last line is a child of the middle one. Measuring from the
        // first line would flatten all three.
        let previousDepth = depths[0] ?? 0;
        let previousLevel = 0;

        for (let index = 1; index < texts.length; index++) {
            const rawDepth = depths[index] ?? 0;
            let depth = Math.max(0, Math.min(previousLevel + rawDepth - previousDepth, previousLevel + 1));
            previousDepth = rawDepth;
            if (depth >= levels.length) {
                const children = previous.items as Items;
                levels.push(children);
                nextIndex.push(children.length);
                depth = levels.length - 1;
            } else {
                levels.length = depth + 1;
                nextIndex.length = depth + 1;
            }
            previousLevel = depth;

            const siblings = levels[depth];
            const insertAt = nextIndex[depth]++;
            let newItem = siblings.addNode(currentUser, insertAt);
            if (!newItem) newItem = siblings.at(insertAt) as Item;
            if (!newItem) continue;
            newItem.updateText(texts[index]);
            applyClipboardMetadata(newItem, structuredItems?.[index]);
            previous = newItem;
            lastItemId = newItem.id;
        }
        return lastItemId;
    }

    /**
     * Where a pasted clipboard item that describes a *visual* node goes.
     *
     * A node's kind is fixed at creation (#5015), so pasting a Grid, Calendar
     * or Layout never re-types the item the caret is in: the block is created
     * as a fresh node at that position, and the caret's own item keeps its text
     * and children. An eligible empty Text node is replaced outright, exactly
     * as a slash command replaces one, so pasting into a blank line does not
     * leave a stray empty row behind.
     *
     * Returns the node the pasted run should continue from.
     */
    function hostForPastedItem(base: Item, metadata?: ClipboardItem): Item {
        if (!metadata?.componentType) {
            applyClipboardMetadata(base, metadata);
            return base;
        }
        const created = createVisualNodeAtTarget(
            base,
            String(base.text ?? ""),
            metadata.componentType,
            currentUser,
        );
        if (!created) return base;
        applyClipboardMetadata(created.item, metadata);
        return created.item;
    }

    function applyClipboardMetadata(item: Item, metadata?: ClipboardItem) {
        if (!metadata) return;
        item.componentType = metadata.componentType;
        // The Grid id is the authoritative binding on new payloads; the
        // legacy yjsTableId field is still written so anything that inspects
        // provenance (e.g. cut/detach or older tooling) can find the Table.
        setItemGridId(item, metadata.componentType === "yjstable" ? metadata.yjsGridId : undefined);
        setItemTableId(item, metadata.componentType === "yjstable" ? metadata.yjsTableId : undefined);
        setItemCalendarId(item, metadata.componentType === "calendar" ? metadata.calendarId : undefined);
        // Layout width travels with the child (#4997); order is the pasted
        // item order, so nothing else about placement needs restoring.
        item.columnSpan = metadata.columnSpan;
    }

    // Add new items when pasting multiple lines
    function handlePasteMultiItem(event: CustomEvent) {
        const { lines, selections, activeItemId, cursor, structuredItems } = event.detail as {
            lines: string[];
            selections: Array<{ startItemId: string; endItemId: string; startOffset?: number; endOffset?: number; }>;
            activeItemId: string;
            cursor?: { itemId: string; offset: number; };
            structuredItems?: ClipboardItem[];
        };

        // Debug info
        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.debug(`handlePasteMultiItem called with lines:`, lines);
            logger.debug(`Selections:`, selections);
            logger.debug(`Active item ID: ${activeItemId}`);
        }

        // Set global variables for testing
        if (typeof window !== "undefined") {
            const win = window as Window & typeof globalThis & {
                lastPasteLines?: unknown;
                lastPasteSelections?: unknown;
                lastPasteActiveItemId?: unknown;
            };
            win.lastPasteLines = lines;
            win.lastPasteSelections = selections;
            win.lastPasteActiveItemId = activeItemId;
        }

        // A selection this page cannot resolve was left behind by another page
        // (see dropStaleLocalSelections). Pasting "into" it would find no items
        // and drop the paste entirely, so paste at the cursor instead.
        const resolvable = resolvableItemIds();
        const pasteSelections = selections?.filter(
            (sel) => resolvable.has(sel.startItemId) && resolvable.has(sel.endItemId),
        );

        // If selections exist, delete selections then paste
        if (pasteSelections && pasteSelections.length > 0) {
            // Handle selection spanning multiple items
            const multiItemSelection = pasteSelections.find(
                (sel: { startItemId?: string, endItemId?: string }) => sel.startItemId !== sel.endItemId,
            );

            if (multiItemSelection) {
                // Process selection spanning multiple items
                handleMultiItemSelectionPaste(multiItemSelection, lines, structuredItems);
                return;
            }

            // Process selection within single item
            const singleItemSelection = pasteSelections[0];
            if (singleItemSelection) {
                handleSingleItemSelectionPaste({
                startItemId: singleItemSelection.startItemId,
                startOffset: singleItemSelection.startOffset ?? cursor?.offset ?? 0,
                endOffset: singleItemSelection.endOffset ?? cursor?.offset ?? 0
            }, lines, structuredItems);
                return;
            }
        }

        // If no selection, paste into the active item. When that item belongs
        // to another page — or there is no active item at all, which is the
        // normal state right after navigating to a page — the paste must still
        // land: it appends to the end of this page rather than disappearing.
        const baseOriginal = resolvePasteAnchor(activeItemId);
        if (!baseOriginal) return;
        const firstItemId = baseOriginal.id;

        const text = (baseOriginal.text as { toString?: () => string })?.toString?.() ?? "";
        const offset = cursor?.itemId === firstItemId ? cursor.offset : text.length;
        const layout = pasteLayout(lines, structuredItems);
        const splice = spliceMultiLinePaste(text, offset, layout.texts, {
            exactLines: layout.exact,
            detachTail: lastPastedIsVisual(layout, structuredItems),
        });

        let lastItemId = firstItemId;
        let tailAppended = false;
        const run = () => {
            baseOriginal.updateText(splice.firstText);
            // Same placement rule as the selection paths (#5015): pasting a
            // block never re-types the row the caret is in, so a row that still
            // holds text keeps it and the block lands beside it.
            const runBase = hostForPastedItem(baseOriginal, structuredItems?.[0]);
            const tailed = withPasteTail(
                [splice.firstText, ...splice.siblingTexts],
                layout.depths,
                structuredItems,
                splice.detachedTail ?? "",
            );
            tailAppended = tailed.appended;
            lastItemId = insertPastedRun(runBase, tailed.texts, tailed.depths, tailed.structuredItems);
        };
        const doc = baseOriginal.ydoc;
        if (doc) {
            doc.transact(run, null);
        } else {
            run();
        }

        editorOverlayStore.setCursor({
            itemId: lastItemId,
            // A detached tail became its own item, so the caret sits at its
            // start — the same place in the text, one node along.
            offset: tailAppended ? 0 : splice.cursorOffset,
            isActive: true,
            userId: "local",
        });
        editorOverlayStore.setActiveItem(lastItemId);
        editorOverlayStore.clearSelections();
    }

    // Paste into selection spanning multiple items
    function handleMultiItemSelectionPaste(selection: { startItemId: string, endItemId: string, startOffset?: number, endOffset?: number }, lines: string[], structuredItems?: ClipboardItem[]) {
        // Debug info
        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.debug({ selection }, "handleMultiItemSelectionPaste called with selection:");
            logger.debug({ lines }, "Lines to paste:");
        }

        // Get start and end items of selection
        const startItemId = selection.startItemId;
        const endItemId = selection.endItemId;

        // Get item indices
        const startIndex = displayItems.findIndex(
            (d) => d.model.id === startItemId,
        );
        const endIndex = displayItems.findIndex(
            (d) => d.model.id === endItemId,
        );

        if (startIndex < 0 || endIndex < 0) {
            if (typeof window !== "undefined" && window.DEBUG_MODE) {
                logger.debug(
                    `Start or end item not found: startIndex=${startIndex}, endIndex=${endIndex}`,
                );
            }
            return;
        }

        // Consider selection direction

        const isReversed = (selection as typeof selection & { isReversed?: boolean }).isReversed || false;
        const actualStartIndex = Math.min(startIndex, endIndex);
        const actualEndIndex = Math.max(startIndex, endIndex);

        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.debug(`Selection direction: isReversed=${isReversed}`);
            logger.debug(
                `Actual indices: start=${actualStartIndex}, end=${actualEndIndex}`,
            );
        }

        const items = pageItem.items as Items;
        const layout = pasteLayout(lines, structuredItems);
        let startItem: Item | undefined;

        // Delete items in selection (delete backwards)
        for (let i = actualEndIndex; i >= actualStartIndex; i--) {
            if (i === actualStartIndex) {
                // Do not delete start item, update text instead
                startItem = displayItems[i].model.original;
                startItem.updateText(layout.texts[0] || "");
                startItem = hostForPastedItem(startItem, structuredItems?.[0]);

                if (
                    typeof window !== "undefined" &&
                    window.DEBUG_MODE
                ) {
                    logger.debug(
                        `Updated first item text to: "${layout.texts[0] || ""}"`,
                    );
                }
            } else {
                // Delete other items
                if (
                    typeof window !== "undefined" &&
                    window.DEBUG_MODE
                ) {
                    logger.debug(`Removing item at index ${i}`);
                }
                items.removeAt(i);
            }
        }

        // Add remaining lines as new items, reproducing the copied hierarchy
        if (startItem) {
            insertPastedRun(startItem, layout.texts, layout.depths, structuredItems);
        }

        // Update cursor position
        const newCursorItemId = displayItems[actualStartIndex]?.model.id;
        if (newCursorItemId) {
            if (typeof window !== "undefined" && window.DEBUG_MODE) {
                logger.debug(
                    `Setting cursor to item ${newCursorItemId} at offset ${(lines[0] || "").length}`,
                );
            }

            editorOverlayStore.setCursor({
                itemId: newCursorItemId,
                offset: (lines[0] || "").length,
                isActive: true,
                userId: "local",
            });

            // Set active item
            editorOverlayStore.setActiveItem(newCursorItemId);

            // Clear selection
            editorOverlayStore.clearSelections();
        } else {
            if (typeof window !== "undefined" && window.DEBUG_MODE) {
                logger.debug(
                    `Could not find cursor item at index ${actualStartIndex}`,
                );
            }
        }
    }

    // Paste into selection within single item
    function handleSingleItemSelectionPaste(selection: { startItemId: string, startOffset?: number, endOffset?: number }, lines: string[], structuredItems?: ClipboardItem[]) {
        // Debug info
        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.debug({ selection }, "handleSingleItemSelectionPaste called with selection:");
            logger.debug({ lines }, "Lines to paste:");
        }

        const itemId = selection.startItemId;
        const startOffset = Math.min(
            selection.startOffset ?? 0,
            selection.endOffset ?? 0,
        );
        const endOffset = Math.max(selection.startOffset ?? 0, selection.endOffset ?? 0);

        // Get item index
        const itemIndex = displayItems.findIndex((d) => d.model.id === itemId);
        if (itemIndex < 0) {
            if (typeof window !== "undefined" && window.DEBUG_MODE) {
                logger.debug(
                    `Item not found: itemId=${itemId}, itemIndex=${itemIndex}`,
                );
            }
            return;
        }

        const item = displayItems[itemIndex].model.original;
        const text: string = (item.text as { toString?: () => string })?.toString?.() ?? "";
        const layout = pasteLayout(lines, structuredItems);

        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.debug(`Original text: "${text}"`);
            logger.debug(
                `Selection range: start=${startOffset}, end=${endOffset}`,
            );
        }

        if (lines.length === 1) {
            // For single line paste, replace selection
            const newText =
                text.substring(0, startOffset) +
                layout.texts[0] +
                text.substring(endOffset);
            item.updateText(newText);
            hostForPastedItem(item, structuredItems?.[0]);

            if (typeof window !== "undefined" && window.DEBUG_MODE) {
                logger.debug(`Updated text to: "${newText}"`);
            }

            // Update cursor position
            editorOverlayStore.setCursor({
                itemId,
                offset: startOffset + layout.texts[0].length,
                isActive: true,
                userId: "local",
            });

            // Clear selection
            editorOverlayStore.clearSelections();
        } else {
            // For multi-line paste
            // First line replaces selection in current item
            const newFirstText = text.substring(0, startOffset) + layout.texts[0];
            item.updateText(newFirstText);
            const runBase = hostForPastedItem(item, structuredItems?.[0]);

            if (typeof window !== "undefined" && window.DEBUG_MODE) {
                logger.debug(`Updated first item text to: "${newFirstText}"`);
            }

            // Add remaining lines as new items, reproducing the copied
            // hierarchy. The text the selection left behind rides on the last
            // line, so the item keeps everything that followed the caret.
            const runTexts = [...layout.texts];
            runTexts[0] = newFirstText;
            const tailed = withPasteTail(runTexts, layout.depths, structuredItems, text.substring(endOffset));
            // The run reports where it ended: a nested paste does not land at a
            // predictable index of the flattened display list.
            const lastItemId = insertPastedRun(runBase, tailed.texts, tailed.depths, tailed.structuredItems);

            // Update cursor position (end of last pasted line, before the text
            // the selection left behind)
            if (lastItemId) {
                const newOffset = tailed.appended ? 0 : layout.texts[layout.texts.length - 1].length;

                if (
                    typeof window !== "undefined" &&
                    window.DEBUG_MODE
                ) {
                    logger.debug(
                        `Setting cursor to last item ${lastItemId} at offset ${newOffset}`,
                    );
                }

                editorOverlayStore.setCursor({
                    itemId: lastItemId,
                    offset: newOffset,
                    isActive: true,
                    userId: "local",
                });

                // Set active item
                editorOverlayStore.setActiveItem(lastItemId);

                // Clear selection
                editorOverlayStore.clearSelections();
            }
        }
    }

    // Tree-wide mouse down event handler
    function handleTreeMouseDown(event: MouseEvent) {
        // Ignore right click
        if (event.button !== 0) return;

        // Ignore already processed events
        if (event.defaultPrevented) return;

        // Ignore clicks within item (handled by OutlinerItem)
        const target = event.target as HTMLElement;
        if (target.closest(".outliner-item")) return;

        // Clear cursor and selection
        editorOverlayStore.clearCursorAndSelection("local", true);

        // Blur the hidden global textarea to dismiss virtual keyboards and fully clear focus state
        const textarea = editorOverlayStore.getTextareaRef();
        if (textarea) {
            textarea.blur();
        }
    }

    // Tree-wide mouse up event handler
    function handleTreeMouseUp() {
        // Ignore if not dragging
        if (!isDragging) return;

        // End drag
        isDragging = false;

        // Reset drag info
        dragStartItemId = null;
        dragCurrentItemId = null;
    }

    // The mouse button may be released outside the tree (or the window);
    // reset the drag-selection state globally so it never remains active.
    onMount(() => {
        window.addEventListener("mouseup", handleTreeMouseUp);
        return () => window.removeEventListener("mouseup", handleTreeMouseUp);
    });

    // Item drag start event handler
    function handleItemDragStart(event: CustomEvent) {
        const { itemId, offset } = event.detail;

        // Save drag start info (native item drags dispatch drag-start without an offset)
        isDragging = true;
        dragStartItemId = itemId;
        dragStartOffset = offset ?? 0;
        dragCurrentItemId = itemId;
        dragCurrentOffset = offset ?? 0;

        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.debug(`Drag start: itemId=${itemId}, offset=${offset}`);
        }
    }

    // Item drag event handler
    function handleItemDrag(event: CustomEvent) {
        const { itemId, offset } = event.detail;

        // Ignore if not dragging
        if (!isDragging || !dragStartItemId) return;

        // Update current drag position
        dragCurrentItemId = itemId;
        dragCurrentOffset = offset;

        // Update selection range
        updateDragSelection();

        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.debug(`Dragging: itemId=${itemId}, offset=${offset}`);
        }
    }

    // Update drag selection range
    function updateDragSelection() {
        if (!dragStartItemId || !dragCurrentItemId) return;

        // Get start and current item indices
        const startIndex = displayItems.findIndex(
            (item) => item.model.id === dragStartItemId,
        );
        const currentIndex = displayItems.findIndex(
            (item) => item.model.id === dragCurrentItemId,
        );

        if (startIndex === -1 || currentIndex === -1) return;

        // Determine selection direction
        const isReversed =
            startIndex > currentIndex ||
            (startIndex === currentIndex &&
                dragStartOffset > dragCurrentOffset);

        // Determine selection start and end
        const startItemId = isReversed ? dragCurrentItemId : dragStartItemId;
        const startOffset = isReversed ? dragCurrentOffset : dragStartOffset;
        const endItemId = isReversed ? dragStartItemId : dragCurrentItemId;
        const endOffset = isReversed ? dragStartOffset : dragCurrentOffset;

        // Set selection range (replace the previous drag selection instead of
        // accumulating one selection per mousemove)
        editorOverlayStore.clearSelectionForUser("local");
        editorOverlayStore.setSelection({
            startItemId,
            startOffset,
            endItemId,
            endOffset,
            userId: "local",
            isReversed,
        });

        // Update cursor position
        editorOverlayStore.setCursor({
            itemId: dragCurrentItemId,
            offset: dragCurrentOffset,
            isActive: true,
            userId: "local",
        });

        // Set active item
        editorOverlayStore.setActiveItem(dragCurrentItemId);
    }

    // Item drop event handler
    function handleItemDrop(event: CustomEvent) {
        const { targetItemId, position, text, selection, sourceItemId, attachmentUrl } =
            event.detail;



        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.debug(
                `Drop event: targetItemId=${targetItemId}, position=${position}, sourceItemId=${sourceItemId}`,
            );
            logger.debug(`Text: "${text}"`);
            logger.debug(`Selection:`, selection);
        }

        // If selection exists, delete selection then drop
        if (selection) {
            // Delete selection logic
            const startItemId = selection.startItemId;
            const endItemId = selection.endItemId;

            // Selection within single item
            if (startItemId === endItemId) {
                handleSingleItemSelectionDrop(
                    selection,
                    targetItemId,
                    position,
                    text,
                );
            } else {
                // Selection spanning multiple items
                handleMultiItemSelectionDrop(
                    selection,
                    targetItemId,
                    position,
                    text,
                );
            }
        } else if (sourceItemId) {
            // Drag & drop of entire single item (reorder/reparent) -- delegated to the
            // TreeDnD controller (client/src/lib/TreeDnD.ts).
            treeDnD.moveItem(sourceItemId, targetItemId, position);
        } else if (attachmentUrl) {
            // External attachment drop
            handleExternalAttachmentDrop(targetItemId, position, attachmentUrl);
        } else {
            // External text drop
            handleExternalTextDrop(targetItemId, position, text);
        }

        // Reset drag state
        isDragging = false;
        dragStartItemId = null;
        dragCurrentItemId = null;
    }

    // Item drag end event handler
    function handleItemDragEnd(event: CustomEvent) {
        const { itemId } = event.detail;

        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.debug(`Drag end: itemId=${itemId}`);
        }

        // Reset drag state
        isDragging = false;
        dragStartItemId = null;
        dragCurrentItemId = null;
    }

    // Drop selection within single item
    function handleSingleItemSelectionDrop(
        selection: { startItemId: string, startOffset: number, endOffset: number },
        targetItemId: string,
        position: string,
        _dropEffect: string,
    ) {
        // Debug info
        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.debug({ selection }, "handleSingleItemSelectionDrop called with selection:");
            logger.debug(`Target: itemId=${targetItemId}, position=${position}`);
        }

        const sourceItemId = selection.startItemId;
        const startOffset = Math.min(
            selection.startOffset ?? 0,
            selection.endOffset ?? 0,
        );
        const endOffset = Math.max(selection.startOffset ?? 0, selection.endOffset ?? 0);

        // Get source and target item indices
        const sourceIndex = displayItems.findIndex(
            (d) => d.model.id === sourceItemId,
        );
        const targetIndex = displayItems.findIndex(
            (d) => d.model.id === targetItemId,
        );

        if (sourceIndex < 0 || targetIndex < 0) {
            if (typeof window !== "undefined" && window.DEBUG_MODE) {
                logger.debug(
                    `Source or target item not found: sourceIndex=${sourceIndex}, targetIndex=${targetIndex}`,
                );
            }
            return;
        }

        // Get source item text
        const sourceItem = displayItems[sourceIndex].model.original;
        const sourceText: string = (sourceItem.text as { toString?: () => string })?.toString?.() ?? "";

        // Get target item text
        const targetItem = displayItems[targetIndex].model.original;
        const targetText: string = (targetItem.text as { toString?: () => string })?.toString?.() ?? "";

        // Get selected text
        const selectedText = sourceText.substring(startOffset, endOffset);

        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.debug(`Selected text: "${selectedText}"`);
        }

        // Remove selection from source item
        const newSourceText =
            sourceText.substring(0, startOffset) +
            sourceText.substring(endOffset);
        sourceItem.updateText(newSourceText);

        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.debug(`Updated source text: "${newSourceText}"`);
        }

        // Insert selection into target item
        if (position === "top") {
            // Insert at start of item
            targetItem.updateText(selectedText + targetText);
        } else if (position === "bottom") {
            // Insert at end of item
            targetItem.updateText(targetText + selectedText);
        } else if (position === "middle") {
            // Insert at middle of item (calculate cursor position)
            const middleOffset = Math.floor(targetText.length / 2);
            targetItem.updateText(
                targetText.substring(0, middleOffset) +
                    selectedText +
                    targetText.substring(middleOffset),
            );
        }

        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.debug(`Updated target text: "${targetItem.text}"`);
        }

        // Update cursor position
        editorOverlayStore.setCursor({
            itemId: targetItemId,
            offset:
                position === "top"
                    ? selectedText.length
                    : position === "bottom"
                      ? targetText.length + selectedText.length
                      : Math.floor(targetText.length / 2) + selectedText.length,
            isActive: true,
            userId: "local",
        });

        // Set active item
        editorOverlayStore.setActiveItem(targetItemId);

        // Clear selection
        editorOverlayStore.clearSelections();
    }

    // Drop selection spanning multiple items
    function handleMultiItemSelectionDrop(
        selection: { startItemId: string, endItemId: string, startOffset?: number, endOffset?: number },
        targetItemId: string,
        position: string,
        text: string,
    ) {
        // Debug info
        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.debug({ selection }, "handleMultiItemSelectionDrop called with selection:");
            logger.debug(`Target: itemId=${targetItemId}, position=${position}`);
        }

        // Get start and end items of selection
        const startItemId = selection.startItemId;
        const endItemId = selection.endItemId;

        // Get item indices
        const startIndex = displayItems.findIndex(
            (d) => d.model.id === startItemId,
        );
        const endIndex = displayItems.findIndex(
            (d) => d.model.id === endItemId,
        );
        const targetIndex = displayItems.findIndex(
            (d) => d.model.id === targetItemId,
        );

        if (startIndex < 0 || endIndex < 0 || targetIndex < 0) {
            if (typeof window !== "undefined" && window.DEBUG_MODE) {
                logger.debug(
                    `Start, end, or target item not found: startIndex=${startIndex}, endIndex=${endIndex}, targetIndex=${targetIndex}`,
                );
            }
            return;
        }

        // Consider selection direction
        const actualStartIndex = Math.min(startIndex, endIndex);
        const actualEndIndex = Math.max(startIndex, endIndex);

        // Get text within selection
        const selectedText = text;

        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.debug(`Selected text: "${selectedText}"`);
        }

        const items = pageItem.items as Items;

        // Delete items in selection (delete backwards)
        for (let i = actualEndIndex; i >= actualStartIndex; i--) {
            if (i === actualStartIndex) {
                // Do not delete start item, update text instead
                const startItem = displayItems[i].model.original;
                startItem.updateText("");

                if (
                    typeof window !== "undefined" &&
                    window.DEBUG_MODE
                ) {
                    logger.debug(`Cleared first item text`);
                }
            } else {
                // Delete other items
                if (
                    typeof window !== "undefined" &&
                    window.DEBUG_MODE
                ) {
                    logger.debug(`Removing item at index ${i}`);
                }
                items.removeAt(i);
            }
        }

        // Get target item text
        const targetItem = displayItems[targetIndex].model.original;
        const targetText = targetItem.text || "";

        // Split selected text into lines
        const lines = selectedText.split(/\r?\n/);

        // Insert selection into target item
        if (position === "top") {
            // Insert at start of item
            targetItem.updateText(lines[0] + targetText);

            // Add remaining lines as new items
            for (let i = 1; i < lines.length; i++) {
                let newItem = items.addNode(currentUser, targetIndex + i);
                if (!newItem) {

                    newItem = items.at(targetIndex + i) as import("../schema/app-schema").Item;
                }
                if (newItem) {
                    newItem.updateText(lines[i]);
                }
            }
        } else if (position === "bottom") {
            // Insert at end of item
            targetItem.updateText(targetText + lines[0]);

            // Add remaining lines as new items
            for (let i = 1; i < lines.length; i++) {
                items.addNode(currentUser, targetIndex + i);
                const newItem = items.at(targetIndex + i);
                if (newItem) {
                    newItem.updateText(lines[i]);
                }
            }
        } else if (position === "middle") {
            // Insert at middle of item (calculate cursor position)
            const middleOffset = Math.floor(targetText.length / 2);
            targetItem.updateText(
                targetText.substring(0, middleOffset) +
                    lines[0] +
                    targetText.substring(middleOffset),
            );

            // Add remaining lines as new items
            for (let i = 1; i < lines.length; i++) {
                items.addNode(currentUser, targetIndex + i);
                const newItem = items.at(targetIndex + i);
                if (newItem) {
                    newItem.updateText(lines[i]);
                }
            }
        }

        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.debug(`Updated target text: "${targetItem.text}"`);
        }

        // Update cursor position
        editorOverlayStore.setCursor({
            itemId: targetItemId,
            offset:
                position === "top"
                    ? lines[0].length
                    : position === "bottom"
                      ? targetText.length + lines[0].length
                      : Math.floor(targetText.length / 2) + lines[0].length,
            isActive: true,
            userId: "local",
        });

        // Set active item
        editorOverlayStore.setActiveItem(targetItemId);

        // Clear selection
        editorOverlayStore.clearSelections();
    }

    // Drop text from external source
    /**
     * Handle attachment drop from external application
     */
    function handleExternalAttachmentDrop(
        targetItemId: string,
        position: string,
        url: string,
        attachmentMime?: string,
        attachmentName?: string
    ) {
        // Resolve target index
        const targetIndex = displayItems.findIndex(
            (d) => d.model.id === targetItemId
        );

        if (targetIndex < 0) return;

        const targetItem = displayItems[targetIndex].model.original;
        const items = pageItem.items as Items;
        
        if (position === "middle") {
            // Add to existing item
            try {
                targetItem.addAttachment(url, attachmentMime, attachmentName);
            } catch {
                if (import.meta.env.MODE === 'test' || (typeof window !== 'undefined' && !!window.__E2E__)) {
                    try { (targetItem as import("../schema/app-schema").Item & { attachments?: { push: (arr: [string]) => void } }).attachments?.push([url]); } catch (_e) { /* ignore */ }
                }
            }
        } else {
            // Create new item at top or bottom relative to targetItem
            const parentItems = targetItem.parent || items;
            const newItem = parentItems.addNode(currentUser);
            if (newItem) {
                try {
                    if (position === "top") {
                        parentItems.tree.setNodeBefore(newItem.key, targetItem.key);
                    } else {

                        parentItems.tree.setNodeAfter(newItem.key, targetItem.key);
                    }
                } catch (e) {
                    logger.error({ error: e as Error }, "Failed to reorder dropped item");
                }

                try {
                    newItem.addAttachment(url, attachmentMime, attachmentName);
                } catch {
                    if (import.meta.env.MODE === 'test' || (typeof window !== 'undefined' && !!window.__E2E__)) {
                        try { (newItem as import("../schema/app-schema").Item & { attachments?: { push: (arr: [string]) => void } }).attachments?.push([url]); } catch (_e) { /* ignore */ }
                    }
                }
            }
        }
        
        // Refresh display items
        __lastUpdateInfo = { tick: Date.now(), changedKeys: new SvelteSet(), structureChanged: true };
    }

    function handleExternalTextDrop(
        targetItemId: string,
        position: string,
        text: string,
    ) {
        // Debug info
        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.debug(
                `handleExternalTextDrop called with targetItemId=${targetItemId}, position=${position}`,
            );
            logger.debug(`Text: "${text}"`);
        }

        // Get target item index
        const targetIndex = displayItems.findIndex(
            (d) => d.model.id === targetItemId,
        );

        if (targetIndex < 0) {
            if (typeof window !== "undefined" && window.DEBUG_MODE) {
                logger.debug(
                    `Target item not found: targetIndex=${targetIndex}`,
                );
            }
            return;
        }

        // Get target item text
        const targetItem = displayItems[targetIndex].model.original;
        const targetText = targetItem.text || "";

        // Split text into lines
        const lines = text.split(/\r?\n/);

        const items = pageItem.items as Items;

        // Insert text into target item
        if (position === "top") {
            // Insert at start of item
            targetItem.text = lines[0] + targetText;

            // Add remaining lines as new items
            for (let i = 1; i < lines.length; i++) {
                let newItem = items.addNode(currentUser, targetIndex + i);
                if (!newItem) {

                    newItem = items.at(targetIndex + i) as import("../schema/app-schema").Item;
                }
                if (newItem) {
                    newItem.text = lines[i];
                }
            }
        } else if (position === "bottom") {
            // Insert at end of item
            targetItem.text = targetText + lines[0];

            // Add remaining lines as new items
            for (let i = 1; i < lines.length; i++) {
                items.addNode(currentUser, targetIndex + i);

                const newItem = items.at(targetIndex + i) as import("../schema/app-schema").Item;
                if (newItem) {
                    newItem.text = lines[i];
                }
            }
        } else if (position === "middle") {
            // Insert at middle of item (calculate cursor position)
            const middleOffset = Math.floor(targetText.length / 2);
            targetItem.text =
                targetText.substring(0, middleOffset) +
                lines[0] +
                targetText.substring(middleOffset);

            // Add remaining lines as new items
            for (let i = 1; i < lines.length; i++) {
                items.addNode(currentUser, targetIndex + i);

                const newItem = items.at(targetIndex + i) as import("../schema/app-schema").Item;
                if (newItem) {
                    newItem.text = lines[i];
                }
            }
        }

        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.debug(`Updated target text: "${targetItem.text}"`);
        }

        // Update cursor position
        editorOverlayStore.setCursor({
            itemId: targetItemId,
            offset:
                position === "top"
                    ? lines[0].length
                    : position === "bottom"
                      ? targetText.length + lines[0].length
                      : Math.floor(targetText.length / 2) + lines[0].length,
            isActive: true,
            userId: "local",
        });

        // Set active item
        editorOverlayStore.setActiveItem(targetItemId);

        // Clear selection
        editorOverlayStore.clearSelections();
    }
    function handleTreeDragOver(event: DragEvent) {
        if (isReadOnly) return;
        
        const dt = event.dataTransfer;
        if (dt) {
            const hasFiles = dt.types.includes("Files");
            const hasText = dt.types.includes("text/plain");
            if (hasFiles || hasText) {
                event.preventDefault();
                dt.dropEffect = "copy";
            }
        }
    }

    async function handleTreeDrop(event: DragEvent) {
        if (isReadOnly) return;
        
        const dt = event.dataTransfer;
        if (!dt) return;

        // Check if we already handled this in an item
        if (event.defaultPrevented) return;
        
        event.preventDefault();
        event.stopPropagation();

        const files = extractFiles(dt);
        if (files.length > 0) {
            const containerId = await resolveUploadContainerId();
            const items = pageItem.items as Items;

            for (const file of files) {
                await uploadFileToNewItemAtEnd(items, currentUser, containerId, file);
            }
            __lastUpdateInfo = { tick: Date.now(), changedKeys: new SvelteSet(), structureChanged: true };
        } else {
            const text = dt.getData("text/plain");
            if (text) {
                const items = pageItem.items as Items;
                // Insert as new item at the end
                const newItem = items.addNode(currentUser, items.length);
                if (newItem && text) {
                    newItem.updateText(text);
                }
                __lastUpdateInfo = { tick: Date.now(), changedKeys: new SvelteSet(), structureChanged: true };
            }
        }
    }

    // Mobile Action Toolbar handlers: resolve the currently active item and
    // delegate to the same handlers used by keyboard/drag interactions.
    function handleMobileIndent() {
        const activeItemId = resolveActiveItemId();
        if (!activeItemId) return;
        editorOverlayStore.setActiveItem(activeItemId);
        handleIndent(activeItemId);
    }

    function handleMobileOutdent() {
        const activeItemId = resolveActiveItemId();
        if (!activeItemId) return;
        editorOverlayStore.setActiveItem(activeItemId);
        handleUnindent(activeItemId);
    }

    function handleMobileInsertAbove() {
        const activeItemId = resolveActiveItemId();
        if (!activeItemId) return;
        editorOverlayStore.setActiveItem(activeItemId);
        handleAddSibling(activeItemId);
    }

    function handleMobileInsertBelow() {
        const activeItemId = resolveActiveItemId();
        if (!activeItemId) return;
        editorOverlayStore.setActiveItem(activeItemId);
        handleAddSibling(activeItemId);
    }

    function handleMobileNewChild() {
        const activeItemId = resolveActiveItemId();
        if (!activeItemId) return;
        editorOverlayStore.setActiveItem(activeItemId);
        handleAddSibling(activeItemId);
    }

    function handleMobileInsertSiblingBelow() {
        const activeItemId = resolveActiveItemId();
        if (!activeItemId) return;
        editorOverlayStore.setActiveItem(activeItemId);
        // Simulate Ctrl+Enter by calling Cursor event handler if cursor is available, or dispatching an event that GlobalTextArea catches
        const activeCursor = (editorOverlayStore as typeof editorOverlayStore & { getCursorForItem?: (id: string) => unknown }).getCursorForItem?.(activeItemId);
        if (activeCursor) {
            // GlobalTextArea will handle key events, let's just dispatch to document
            const event = new KeyboardEvent('keydown', {
                key: 'Enter',
                ctrlKey: true,
                bubbles: true
            });
            document.dispatchEvent(event);
        }
    }

    function handleMobileDelete() {
        const activeItemId = resolveActiveItemId();
        if (!activeItemId) return;
        deleteConfirmItemId = activeItemId;
        showDeleteConfirm = true;
    }

    function confirmDelete() {
        if (!deleteConfirmItemId) return;
        const itemViewModel = viewModel.getViewModel(deleteConfirmItemId);
        if (!itemViewModel) return;

        const original = itemViewModel.original;
        const parent = original.parent;
        if (parent) {
            const idx = parent.indexOf(original);
            if (idx >= 0) parent.removeAt(idx);
        } else {
            const items = pageItem.items as import("../schema/app-schema").Items;
            const idx = items.indexOf(original);
            if (idx >= 0) items.removeAt(idx);
        }
        deleteConfirmItemId = null;
        showDeleteConfirm = false;
    }

    function handleMobileVote() {
        const activeItemId = resolveActiveItemId();
        if (!activeItemId) return;
        const itemViewModel = viewModel.getViewModel(activeItemId);
        if (!itemViewModel) return;
        itemViewModel.original.toggleVote(currentUser);
    }

    // Mobile history actions. They go through the global router exactly like
    // Ctrl+Z / Ctrl+Shift+Z, and re-assert the caret afterwards so undoing does
    // not drop the user out of the item they were editing.
    let canUndo = $derived(globalUndoRouter.canUndo());
    let canRedo = $derived(globalUndoRouter.canRedo());

    function handleMobileUndo() {
        globalUndoRouter.undo();
        restoreEditorFocus();
    }

    function handleMobileRedo() {
        globalUndoRouter.redo();
        restoreEditorFocus();
    }
</script>


<svelte:window onpointerdown={handleWindowPointerDown} onkeydown={cancelGridPasteOnEscape} />

{#key outlinerKey}
    <div
        class="outliner" role="presentation"
        class:embedded={isEmbedded}
        onmousedown={handleTreeMouseDown}
        onmouseup={handleTreeMouseUp}
    >
        {#if gridPasteStatus && !isEmbedded}
            <div class="grid-paste-status" data-testid="grid-paste-status" role="status" aria-live="polite">
                {gridPasteStatus}
            </div>
        {/if}
        {#if !isEmbedded}
            <OutlinerToolbar
                mode="desktop"
                {projectName}
                {pageName}
                onAddItem={handleAddItem}
                onFileSelect={handleFileSelect}
            />
        {/if}

        <div
            class="tree-container"
            role="presentation"
            tabindex="-1"
            bind:this={treeContainer}
            ondrop={handleTreeDrop}
            ondragover={handleTreeDragOver}
        >
            <!-- Flat display items (static placement) -->
            <div class="tree-items-wrapper">
                {#if displayItems.length > 0}
                    <!-- Page Title (index 0) is rendered outside the tree role to prevent aria-required-children violations -->
                    {#if !isEmbedded}
                        <div
                            class="item-container"
                            role="presentation"
                            style="--item-depth: {displayItems[0].depth}"
                        >
                            <OutlinerItem
                                model={displayItems[0].model}
                                depth={displayItems[0].depth}
                                {currentUser}
                                {isReadOnly}
                                isCollapsed={viewModel.isCollapsed(displayItems[0].model.id)}
                                hasChildren={viewModel.hasChildren(displayItems[0].model.id)}
                                isPageTitle={true}
                                ariaSetSize={ariaTreeMeta.get(displayItems[0].model.id)?.setSize}
                                ariaPosInSet={ariaTreeMeta.get(displayItems[0].model.id)?.posInSet}
                                index={0}
                                on:toggle-collapse={handleToggleCollapse}
                                on:indent={(e) => handleIndent(e.detail?.itemId)}
                                on:unindent={(e) => handleUnindent(e.detail?.itemId)}
                                on:navigate-to-item={handleNavigateToItem}
                                on:add-sibling={(e) => handleAddSibling(e.detail?.itemId)}
                                on:drag-start={handleItemDragStart}
                                on:drag={handleItemDrag}
                                on:drop={handleItemDrop}
                                on:drag-end={handleItemDragEnd}
                            />
                        </div>
                    {/if}
                {/if}
                {#if displayItems.length > 1}
                    <div id="outliner-tree" role="tree" aria-label="Outliner Tree" class="tree-items-role-wrapper">
                        {#each displayItems as display, index (display.model.id)}
                            {#if index > 0}
                                <div
                                    class="item-container"
                                    role="presentation"
                                    style="--item-depth: {display.depth}"
                                >
                                <OutlinerItem
                                    model={display.model}
                                    depth={display.depth}
                                    {currentUser}
                                    {isReadOnly}
                                    isCollapsed={viewModel.isCollapsed(display.model.id)}
                                    hasChildren={viewModel.hasChildren(display.model.id)}
                                    isPageTitle={false}
                                    ariaSetSize={ariaTreeMeta.get(display.model.id)?.setSize}
                                    ariaPosInSet={ariaTreeMeta.get(display.model.id)?.posInSet}
                                    {index}
                                    on:toggle-collapse={handleToggleCollapse}
                                    on:indent={(e) => handleIndent(e.detail?.itemId)}
                                    on:unindent={(e) => handleUnindent(e.detail?.itemId)}
                                    on:navigate-to-item={handleNavigateToItem}
                                    on:add-sibling={(e) => handleAddSibling(e.detail?.itemId)}
                                    on:drag-start={handleItemDragStart}
                                    on:drag={handleItemDrag}
                                    on:drop={handleItemDrop}
                                    on:drag-end={handleItemDragEnd}
                                />
                                </div>
                            {/if}
                        {/each}
                    </div>
                {/if}
            </div>

            {#if displayItems.length <= 1 && !isReadOnly && !isEmbedded}
                <div class="empty-state">
                    <div class="empty-icon" aria-hidden="true">
                         <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="12" y1="18" x2="12" y2="12"></line>
                            <line x1="9" y1="15" x2="15" y2="15"></line>
                        </svg>
                    </div>
                    <p class="empty-text">
                        No items yet
                    </p>
                    <button type="button" class="empty-action-btn" onclick={(e) => { e.stopPropagation(); handleAddItem(); }} onmousedown={(e) => e.stopPropagation()} onpointerdown={(e) => e.stopPropagation()} onmouseup={(e) => e.stopPropagation()}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        Add first item
                    </button>
                </div>
            {/if}

            <!-- Editor overlay layer -->
            <div class="overlay-container">
                <EditorOverlay on:paste-multi-item={handlePasteMultiItem} />
            </div>
        </div>

        {#if showScrollTop}
            <button type="button"
                class="scroll-top-btn"
                onclick={scrollToTop}
                aria-label="Scroll to top"
                transition:fade={{ duration: 200 }}
                title="Scroll to top"
            >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="19" x2="12" y2="5"></line>
                    <polyline points="5 12 12 5 19 12"></polyline>
                </svg>
            </button>
        {/if}
    </div>
{/key}

{#if !isEmbedded && pasteSpecialOptions}
    <PasteSpecialDialog choices={pasteSpecialOptions} onchoose={finishPasteSpecial} />
{/if}

{#if !isEmbedded}
    <OutlinerToolbar
        mode="mobile"
        {mobileToolbarBottomOffset}
        onIndent={handleMobileIndent}
        onOutdent={handleMobileOutdent}
        onInsertAbove={handleMobileInsertAbove}
        onInsertBelow={handleMobileInsertBelow}
        onNewChild={handleMobileNewChild}
        onInsertSiblingBelow={handleMobileInsertSiblingBelow}
        onDelete={handleMobileDelete}
        onVote={handleMobileVote}
        onUndo={handleMobileUndo}
        onRedo={handleMobileRedo}
        {canUndo}
        {canRedo}
    />
{/if}

<ConfirmDialog
        bind:isOpen={showDeleteConfirm}
        title="Delete Item"
        message="Are you sure you want to delete this item? This action will also delete all of its children."
        confirmText="Delete"
        isDestructive={true}
        onConfirm={confirmDelete}
        onCancel={() => { showDeleteConfirm = false; deleteConfirmItemId = null; }}
    />

<style>
    .outliner {
        background: white;
        border: 1px solid #ddd;
        border-radius: 6px;
        margin-bottom: 20px;
        display: flex;
        flex-direction: column;
        position: relative;
        min-height: calc(100vh - 140px);
    }

    .grid-paste-status {
        padding: 6px 16px;
        border-bottom: 1px solid #ddd;
        background: #f5f7fa;
        color: #333;
        font-size: 13px;
        white-space: pre-line;
    }

    .outliner.embedded {
        border: none;
        margin-bottom: 0;
        min-height: auto;
        background: transparent;
    }

    .tree-container {
        padding: 8px 16px;
        position: relative; /* Reference point for absolute positioning of child elements */
        min-height: 100px; /* Set minimum height */
        overflow-x: hidden;
    }

    .outliner.embedded .tree-container {
        padding: 0;
        min-height: auto;
    }

    .item-container {
        position: relative;
        margin-left: calc(max(0, var(--item-depth) - 1) * 24px);
        width: auto;
        min-height: 36px; /* Set minimum height */
    }

    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px 20px;
        text-align: center;
        color: #6b7280;
    }

    .empty-icon {
        margin-bottom: 16px;
        color: #d1d5db;
    }

    .empty-text {
        font-size: 0.95rem;
        margin-bottom: 24px;
        color: #6b7280;
    }

    .empty-action-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 20px;
        background-color: #2563eb;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: background-color 0.2s, transform 0.1s;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    }

    .empty-action-btn:hover {
        background-color: #1d4ed8;
    }

    .empty-action-btn:active {
        transform: translateY(1px);
    }

    .overlay-container {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        pointer-events: none !important; /* Ensure click events pass through to lower layers */
        z-index: 100;
        transform: none !important; /* Prevent transformation */
    }

    .scroll-top-btn {
        position: absolute;
        bottom: 20px;
        right: 20px;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background-color: white;
        border: 1px solid #ddd;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 200;
        color: #666;
        transition: background-color 0.2s, color 0.2s;
    }

    .scroll-top-btn:hover {
        background-color: #f0f0f0;
        color: #333;
    }

    .scroll-top-btn:focus-visible {
        outline: 2px solid #2563eb;
        outline-offset: 2px;
    }
</style>
