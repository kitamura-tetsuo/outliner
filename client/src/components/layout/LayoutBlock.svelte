<script lang="ts">
// The Layout container (#4997): an embedded block inside an outliner item
// (componentType "layout") that arranges its *direct* children side by side on
// a fixed 12-column CSS Grid.
//
// The Layout owns nothing of its own: children are ordinary tree items, tree
// order is the rendered order, and the only per-child state is an integer
// `columnSpan` (1..12). Rows and columns come from CSS Grid auto-placement, so
// no coordinate is persisted and there is no second ordering model to
// reconcile with the outline.
//
// Children render through the normal component path
// (OutlinerItemComponentRenderer), so Grid and Calendar behave exactly as they
// do outside a Layout.

import { onMount } from "svelte";
import type { Item } from "../../schema/app-schema";
import { getLogger } from "../../lib/logger";
import { editorOverlayStore } from "../../stores/EditorOverlayStore.svelte";
import { BLOCK_DND_OWNER_ATTRIBUTE, BLOCK_DND_TYPE_ATTRIBUTE } from "../../services/dnd/blockDndOwnership";
import { isVisualComponentType, LAYOUT_CHILD_DND_TYPE, LAYOUT_COLUMN_COUNT } from "../../services/layout/layoutModel";
import {
    adjustColumnSpan,
    canAcceptAsLayoutChild,
    columnSpanOf,
    layoutChildren,
    moveIntoLayout,
    moveOutOfLayout,
    moveWithinLayout,
    setColumnSpan,
} from "../../services/layout/layoutTree";
import { store as generalStore } from "../../stores/store.svelte";

/** `DataTransfer` type an OutlinerItem drag carries (OutlinerItem.handleDragStart). */
const OUTLINER_ITEM_DND_TYPE = "application/x-outliner-item";

const logger = getLogger("LayoutBlock");

interface Props {
    item: Item;
}

let { item }: Props = $props();

// Bumped by the Yjs observer so the derived children/spans re-read the tree.
// Structural moves and span writes both land in the "orderedTree" map, so one
// observer covers order and width alike — including a collaborator's edits.
let treeVersion = $state(0);

let gridRef = $state<HTMLDivElement | undefined>(undefined);
let hasFocusWithin = $state(false);

/** Child id currently being span-resized, and the span previewed for it. */
let resizingChildId = $state<string | undefined>(undefined);
let previewSpan = $state<number | undefined>(undefined);
let resizeStartX = 0;
let resizeStartSpan = 1;

/** Drag state for reordering children inside this Layout. */
let draggingChildId = $state<string | undefined>(undefined);
let dropTargetChildId = $state<string | undefined>(undefined);
let dropTargetSide = $state<"before" | "after">("before");

const children = $derived.by(() => {
    void treeVersion;
    return layoutChildren(item);
});

const spans = $derived.by(() => {
    void treeVersion;
    return new Map(children.map(child => [child.id, columnSpanOf(child)]));
});

/** Identity of the document this block is bound to; see the {#key} below. */
const docKey = $derived.by(() => {
    void treeVersion;
    try {
        return item.ydoc?.guid ?? item.id;
    } catch {
        return "";
    }
});

const layoutItemId = $derived.by(() => {
    void treeVersion;
    try {
        return item.id;
    } catch {
        return "";
    }
});

// Grid guides are editing chrome: they appear while the Layout is the active
// item, while focus is inside it, or during a resize - never during plain
// reading.
const isEditing = $derived(
    hasFocusWithin
        || resizingChildId !== undefined
        || (layoutItemId.length > 0 && editorOverlayStore.activeItemId === layoutItemId),
);

const guideColumns = Array.from({ length: LAYOUT_COLUMN_COUNT }, (_, index) => index);

function renderedSpan(child: Item): number {
    if (child.id === resizingChildId && previewSpan !== undefined) return previewSpan;
    return spans.get(child.id) ?? LAYOUT_COLUMN_COUNT;
}

function childText(child: Item): string {
    try {
        return String(child.text ?? "").trim();
    } catch {
        return "";
    }
}

function componentTypeOf(child: Item): string | undefined {
    try {
        return child.componentType;
    } catch {
        return undefined;
    }
}

/**
 * Only visual blocks belong here, and both the drop guard and the "Change to
 * Layout" guard enforce that. A child that is not one can still reach this
 * point from an older or third-party document, and it must not become
 * invisible: it gets a plain-text cell instead of a component.
 */
function isVisualChild(child: Item): boolean {
    return isVisualComponentType(componentTypeOf(child));
}

onMount(() => {
    const ymap = item.ydoc?.getMap?.("orderedTree") as
        | { observeDeep?: (handler: () => void) => void; unobserveDeep?: (handler: () => void) => void; }
        | undefined;
    if (!ymap || typeof ymap.observeDeep !== "function") return;

    const handler = () => {
        treeVersion++;
    };
    ymap.observeDeep(handler);
    return () => {
        try {
            ymap.unobserveDeep?.(handler);
        } catch (error) {
            logger.warn({ error }, "failed to detach tree observer");
        }
    };
});

/** Width of one column track, so a pointer delta converts to whole columns. */
function columnWidth(): number {
    const width = gridRef?.getBoundingClientRect().width ?? 0;
    if (width <= 0) return 0;
    return width / LAYOUT_COLUMN_COUNT;
}

function startResize(child: Item, event: PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    resizingChildId = child.id;
    resizeStartSpan = spans.get(child.id) ?? LAYOUT_COLUMN_COUNT;
    previewSpan = resizeStartSpan;
    resizeStartX = event.clientX;
    (event.currentTarget as HTMLElement)?.setPointerCapture?.(event.pointerId);
}

function moveResize(event: PointerEvent) {
    if (resizingChildId === undefined) return;
    const perColumn = columnWidth();
    if (perColumn <= 0) return;
    const delta = Math.round((event.clientX - resizeStartX) / perColumn);
    const next = Math.min(LAYOUT_COLUMN_COUNT, Math.max(1, resizeStartSpan + delta));
    previewSpan = next;
}

/** Only the final span is persisted; the drag itself stays local preview state. */
function endResize(child: Item, event: PointerEvent) {
    if (resizingChildId === undefined) return;
    (event.currentTarget as HTMLElement)?.releasePointerCapture?.(event.pointerId);
    const finalSpan = previewSpan;
    resizingChildId = undefined;
    previewSpan = undefined;
    if (finalSpan !== undefined && finalSpan !== resizeStartSpan) setColumnSpan(child, finalSpan);
}

/** Keyboard-accessible equivalent of the resize drag. */
function handleResizeKey(child: Item, event: KeyboardEvent) {
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        event.preventDefault();
        adjustColumnSpan(child, 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        event.preventDefault();
        adjustColumnSpan(child, -1);
    } else if (event.key === "Home") {
        event.preventDefault();
        setColumnSpan(child, 1);
    } else if (event.key === "End") {
        event.preventDefault();
        setColumnSpan(child, LAYOUT_COLUMN_COUNT);
    }
}

function handleChildDragStart(child: Item, event: DragEvent) {
    draggingChildId = child.id;
    event.dataTransfer?.setData(LAYOUT_CHILD_DND_TYPE, child.id);
    event.dataTransfer?.setData("text/plain", childText(child));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

function isLayoutChildDrag(event: DragEvent): boolean {
    const types = event.dataTransfer?.types;
    if (types && Array.from(types).includes(LAYOUT_CHILD_DND_TYPE)) return true;
    // Playwright's synthesized drags cannot always populate `types`; the local
    // drag state identifies our own gesture in that case.
    return draggingChildId !== undefined;
}

/**
 * The item a drag is carrying: one of this Layout's own children being
 * reordered, or an outline item being moved in. An outline item that is not an
 * eligible visual block resolves to nothing, so the drop is refused and the
 * tree is left alone.
 */
function draggedItem(event: DragEvent): { item: Item; fromLayout: boolean; } | undefined {
    if (isLayoutChildDrag(event)) {
        const id = event.dataTransfer?.getData?.(LAYOUT_CHILD_DND_TYPE) || draggingChildId;
        const child = id ? children.find(entry => entry.id === id) : undefined;
        return child ? { item: child, fromLayout: true } : undefined;
    }

    const outlineId = event.dataTransfer?.getData?.(OUTLINER_ITEM_DND_TYPE);
    if (!outlineId) return undefined;
    const incoming = generalStore.activeViewModel?.getViewModel(outlineId)?.original;
    if (!incoming || !canAcceptAsLayoutChild(incoming)) return undefined;
    return { item: incoming, fromLayout: false };
}

/** True for a drag this block should show a drop target for. */
function isAcceptableDrag(event: DragEvent): boolean {
    if (isLayoutChildDrag(event)) return true;
    const types = event.dataTransfer?.types;
    return types !== undefined && Array.from(types).includes(OUTLINER_ITEM_DND_TYPE);
}

function handleChildDragOver(child: Item, event: DragEvent) {
    if (!isAcceptableDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    dropTargetChildId = child.id;
    dropTargetSide = event.clientX < rect.left + rect.width / 2 ? "before" : "after";
}

function handleChildDrop(child: Item, event: DragEvent) {
    if (!isAcceptableDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const dragged = draggedItem(event);
    const side = dropTargetSide;
    clearDragState();
    if (!dragged || dragged.item.id === child.id) return;

    if (dragged.fromLayout) {
        moveWithinLayout(item, dragged.item, child, side);
        return;
    }
    const index = children.findIndex(entry => entry.id === child.id);
    moveIntoLayout(item, dragged.item, side === "before" ? index : index + 1);
}

/** A drop on the Layout's own surface (including the empty state) appends. */
function handleBlockDragOver(event: DragEvent) {
    if (!isAcceptableDrag(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    dropTargetChildId = undefined;
}

function handleBlockDrop(event: DragEvent) {
    if (!isAcceptableDrag(event)) return;
    event.preventDefault();
    const dragged = draggedItem(event);
    clearDragState();
    if (!dragged || dragged.fromLayout) return;
    moveIntoLayout(item, dragged.item);
}

function clearDragState() {
    draggingChildId = undefined;
    dropTargetChildId = undefined;
}

function handleMoveOut(child: Item) {
    moveOutOfLayout(item, child);
}
</script>

<!-- Bound 1:1 to this item's Y.Doc: keying the render body on the doc guid
     (falling back to the item id) remounts everything if the underlying
     document is ever swapped, so no observer rebinding lives in here
     (AGENTS.md, "Yjs-bound components and Svelte key"). -->
{#key docKey}
<div
    class="layout-block"
    class:editing={isEditing}
    data-testid="layout-block"
    data-layout-columns={LAYOUT_COLUMN_COUNT}
    data-layout-child-count={children.length}
    {...{
        [BLOCK_DND_OWNER_ATTRIBUTE]: "layout",
        [BLOCK_DND_TYPE_ATTRIBUTE]: `${LAYOUT_CHILD_DND_TYPE},${OUTLINER_ITEM_DND_TYPE}`,
    }}
    onfocusin={() => { hasFocusWithin = true; }}
    onfocusout={(event) => {
        const next = event.relatedTarget as Node | null;
        if (!next || !(event.currentTarget as HTMLElement).contains(next)) hasFocusWithin = false;
    }}
    ondragover={handleBlockDragOver}
    ondrop={handleBlockDrop}
    ondragend={clearDragState}
>
    <div class="layout-grid-container">
        <div class="layout-grid" bind:this={gridRef} data-testid="layout-grid">
            {#if isEditing}
                <div class="layout-guides" aria-hidden="true" data-testid="layout-guides">
                    {#each guideColumns as column (column)}
                        <span class="layout-guide"></span>
                    {/each}
                </div>
            {/if}

            {#each children as child (child.id)}
                <div
                    class="layout-cell"
                    class:dragging={draggingChildId === child.id}
                    class:drop-before={dropTargetChildId === child.id && dropTargetSide === "before"}
                    class:drop-after={dropTargetChildId === child.id && dropTargetSide === "after"}
                    style="--column-span: {renderedSpan(child)}"
                    data-testid="layout-cell"
                    data-item-id={child.id}
                    data-column-span={renderedSpan(child)}
                    role="group"
                    aria-label={childText(child) || "Layout block"}
                    ondragover={(event) => handleChildDragOver(child, event)}
                    ondrop={(event) => handleChildDrop(child, event)}
                    ondragleave={() => { dropTargetChildId = undefined; }}
                >
                    <div class="layout-cell-toolbar">
                        <span
                            class="layout-cell-handle"
                            draggable="true"
                            role="button"
                            tabindex="0"
                            aria-label="Reorder block"
                            title="Drag to reorder"
                            data-testid="layout-cell-handle"
                            ondragstart={(event) => handleChildDragStart(child, event)}
                            ondragend={clearDragState}
                        >⠿</span>

                        {#if childText(child) && isVisualChild(child)}
                            <span class="layout-cell-caption">{childText(child)}</span>
                        {/if}

                        <span class="layout-cell-actions">
                            <button
                                type="button"
                                tabindex="-1"
                                class="layout-span-button"
                                aria-label="Decrease width"
                                data-testid="layout-span-decrease"
                                onclick={() => adjustColumnSpan(child, -1)}
                            >−</button>
                            <span class="layout-span-value" data-testid="layout-span-value">
                                {renderedSpan(child)}/{LAYOUT_COLUMN_COUNT}
                            </span>
                            <button
                                type="button"
                                tabindex="-1"
                                class="layout-span-button"
                                aria-label="Increase width"
                                data-testid="layout-span-increase"
                                onclick={() => adjustColumnSpan(child, 1)}
                            >+</button>
                            <button
                                type="button"
                                tabindex="-1"
                                class="layout-span-button"
                                aria-label="Move out of layout"
                                title="Move out of layout"
                                data-testid="layout-move-out"
                                onclick={() => handleMoveOut(child)}
                            >⤓</button>
                        </span>
                    </div>

                    <div class="layout-cell-body">
                        {#if isVisualChild(child)}
                            {#await import("../OutlinerItemComponentRenderer.svelte") then { default: ComponentRenderer }}
                                <ComponentRenderer componentType={componentTypeOf(child)} item={child} />
                            {/await}
                        {:else}
                            <div class="layout-cell-fallback" data-testid="layout-cell-fallback">
                                {childText(child) || "(empty item)"}
                            </div>
                        {/if}
                    </div>

                    <!-- Span resize: whole-column drag, with the same control
                         reachable from the keyboard as a slider. -->
                    <div
                        class="layout-cell-resizer"
                        role="slider"
                        tabindex="0"
                        aria-label="Column span"
                        aria-valuemin={1}
                        aria-valuemax={LAYOUT_COLUMN_COUNT}
                        aria-valuenow={renderedSpan(child)}
                        data-testid="layout-cell-resizer"
                        onpointerdown={(event) => startResize(child, event)}
                        onpointermove={moveResize}
                        onpointerup={(event) => endResize(child, event)}
                        onpointercancel={(event) => endResize(child, event)}
                        onkeydown={(event) => handleResizeKey(child, event)}
                    ></div>
                </div>
            {/each}
        </div>

        {#if children.length === 0}
            <!-- An empty Layout is valid and stays as an insertion target: the
                 user may simply be between rearrangements. -->
            <div
                class="layout-empty"
                data-testid="layout-empty"
                role="note"
            >
                Empty layout — drop a Database or Calendar block here.
            </div>
        {/if}
    </div>
</div>
{/key}

<style>
.layout-block {
    width: 100%;
    margin-top: 4px;
}

/* The responsive threshold is the Layout's own width, not the viewport's, so a
   Layout inside a narrow container collapses on its own terms. */
.layout-grid-container {
    container-type: inline-size;
    container-name: layout-block;
    width: 100%;
}

.layout-grid {
    position: relative;
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 12px;
    align-items: start;
}

.layout-guides {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 12px;
    pointer-events: none;
    z-index: 0;
}

.layout-guide {
    border-left: 1px dashed rgba(99, 102, 241, 0.35);
    border-right: 1px dashed rgba(99, 102, 241, 0.35);
    background: rgba(99, 102, 241, 0.04);
}

.layout-cell {
    position: relative;
    z-index: 1;
    grid-column: span var(--column-span);
    min-width: 0;
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 2px;
}

.layout-block.editing .layout-cell {
    border-color: #e5e7eb;
}

.layout-cell.dragging {
    opacity: 0.5;
}

.layout-cell.drop-before {
    box-shadow: inset 3px 0 0 0 #6366f1;
}

.layout-cell.drop-after {
    box-shadow: inset -3px 0 0 0 #6366f1;
}

.layout-cell-toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 20px;
    font-size: 0.75rem;
    color: #6b7280;
}

.layout-cell-handle {
    cursor: grab;
    user-select: none;
}

.layout-cell-caption {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.layout-cell-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-left: auto;
    opacity: 0;
    transition: opacity 0.15s;
}

.layout-cell:hover .layout-cell-actions,
.layout-cell:focus-within .layout-cell-actions,
.layout-block.editing .layout-cell-actions {
    opacity: 1;
}

.layout-span-button {
    border: 1px solid #d1d5db;
    background: white;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.75rem;
    line-height: 1;
    padding: 2px 5px;
}

.layout-span-value {
    min-width: 34px;
    text-align: center;
    font-variant-numeric: tabular-nums;
}

.layout-cell-body {
    min-width: 0;
}

.layout-cell-fallback {
    padding: 4px 6px;
    color: #6b7280;
    overflow-wrap: anywhere;
}

.layout-cell-resizer {
    position: absolute;
    top: 0;
    right: -6px;
    width: 12px;
    height: 100%;
    cursor: col-resize;
    opacity: 0;
    background: linear-gradient(to right, transparent 45%, #6366f1 45%, #6366f1 55%, transparent 55%);
}

.layout-cell:hover .layout-cell-resizer,
.layout-cell-resizer:focus-visible,
.layout-block.editing .layout-cell-resizer {
    opacity: 1;
}

.layout-empty {
    border: 1px dashed #d1d5db;
    border-radius: 6px;
    padding: 16px;
    text-align: center;
    color: #9ca3af;
    font-size: 0.8rem;
}

/* Too narrow for useful side-by-side rendering: one block per row, in tree
   order. Persisted spans are untouched, so the layout returns to them by
   itself once the width comes back. */
@container layout-block (max-width: 640px) {
    .layout-cell {
        grid-column: 1 / -1;
    }

    .layout-guides {
        display: none;
    }
}

/* Fallback for engines without container queries. */
@supports not (container-type: inline-size) {
    @media (max-width: 768px) {
        .layout-cell {
            grid-column: 1 / -1;
        }
    }
}
</style>
