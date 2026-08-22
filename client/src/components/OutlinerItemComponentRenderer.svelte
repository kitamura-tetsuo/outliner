<script lang="ts">
import type { Item } from "../schema/app-schema";
import { VISUAL_NODE_ROOT_ATTRIBUTE } from "../lib/selectionGeometry";
import { VISUAL_NODE_SELECTION_SURFACE_ATTRIBUTE } from "../lib/selection/outlineSelectionDom";
import { LAYOUT_COMPONENT_TYPE } from "../services/layout/layoutModel";

interface Props {
    componentType: string | undefined;
    item: Item;
    /**
     * True when this block *is* an outline row, false when it is drawn inside another
     * block (a Layout's cell). Only a row carries the outline's selection surface: a
     * Layout's children are part of its picture, not rows a selection can name (#5026).
     */
    outlineRow?: boolean;
}

let { componentType, item, outlineRow = true }: Props = $props();

/**
 * The wrapper is the visual node's root box (#5024): everything the block draws
 * lives inside it, so the editor overlay can highlight a selected Grid, Calendar
 * or Layout from this one rectangle without knowing what any of them render.
 */
const rootAttributes = $derived({ [VISUAL_NODE_ROOT_ATTRIBUTE]: item.id });

/**
 * The outline layer's own selection surface (#5026).
 *
 * A block owns every gesture on its content - a drag inside a Grid cell selects that
 * cell's text, a click on a button presses it - so the outline does not take clicks away
 * from it. It gets a gutter of its own instead, in the row's indentation column, and
 * selecting the block as an outline node starts there.
 */
const selectionSurfaceAttributes = $derived({ [VISUAL_NODE_SELECTION_SURFACE_ATTRIBUTE]: item.id });
</script>

{#snippet selectionSurface()}
    {#if outlineRow}
        <!-- Presentational: it carries no content of its own, and the block it belongs to
             is already named by its outline row. -->
        <div
            class="visual-node-selection-surface"
            role="presentation"
            aria-hidden="true"
            {...selectionSurfaceAttributes}
        ></div>
    {/if}
{/snippet}

{#if componentType === "yjstable"}
    {#await import("./yjstable/YjsTableBlock.svelte") then { default: YjsTableBlock }}
        <div class="component-wrapper" class:outline-row={outlineRow} {...rootAttributes}>
            {@render selectionSurface()}
            <YjsTableBlock item={item} />
        </div>
    {/await}
{:else if componentType === "calendar"}
    {#await import("./calendar/CalendarBlock.svelte") then { default: CalendarBlock }}
        <div class="component-wrapper" class:outline-row={outlineRow} {...rootAttributes}>
            {@render selectionSurface()}
            <CalendarBlock item={item} />
        </div>
    {/await}
{:else if componentType === LAYOUT_COMPONENT_TYPE}
    {#await import("./layout/LayoutBlock.svelte") then { default: LayoutBlock }}
        <div class="component-wrapper" class:outline-row={outlineRow} {...rootAttributes}>
            {@render selectionSurface()}
            <LayoutBlock item={item} />
        </div>
    {/await}
{/if}

<style>
.component-wrapper {
    position: relative;
    margin-top: 4px;
    width: 100%;
}

/*
 * The gutter is carved out of the row's own indentation column rather than out of the
 * block: the negative margin and the matching extra width leave the block exactly the
 * width it would have had without a selection surface, so nothing a block renders is
 * squeezed by being selectable.
 */
.component-wrapper.outline-row {
    box-sizing: border-box;
    margin-left: calc(-1 * var(--visual-node-gutter, 14px));
    width: calc(100% + var(--visual-node-gutter, 14px));
    padding-left: var(--visual-node-gutter, 14px);
}

/* Full-height strip down the block's outer edge: wide enough to grab, and clear of
   everything the block itself draws. */
.visual-node-selection-surface {
    position: absolute;
    left: 0;
    top: 0;
    width: var(--visual-node-gutter, 14px);
    height: 100%;
    cursor: default;
    border-radius: 3px;
    transition: background-color 0.15s;
}

.visual-node-selection-surface:hover {
    background-color: rgba(59, 130, 246, 0.14);
}
</style>
