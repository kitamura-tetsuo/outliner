/**
 * The Layout container's data model (#4997).
 *
 * A Layout is an ordinary outline item that owns its direct children through
 * the normal tree, plus two rules:
 *
 *   1. only *visual* blocks may be direct children;
 *   2. each child stores a single integer `columnSpan` (1..12).
 *
 * There is deliberately no second ordering model: tree order is canonical and
 * CSS Grid auto-placement derives rows and columns from order + span. Nothing
 * else about placement is persisted — no x/y, row numbers, column starts,
 * per-track fractions, row spans or pixel widths.
 *
 * The node-kind registry those rules read from lives in
 * `$shared/services/outlineNodeKind` (#5015) so the schema, the editor and this
 * module all classify a node the same way; this file keeps only what is
 * specific to arranging blocks in a Layout.
 */

import {
    CALENDAR_COMPONENT_TYPE,
    canAcceptChild,
    GRID_COMPONENT_TYPE,
    isLayoutNode,
    isVisualLeafNode,
    LAYOUT_COMPONENT_TYPE,
} from "$shared/services/outlineNodeKind";

export {
    CALENDAR_COMPONENT_TYPE,
    canAcceptChild,
    canNodeHaveChildren,
    GRID_COMPONENT_TYPE,
    isLayoutNode,
    isTextNode,
    isVisualLeafNode,
    isVisualNode,
    LAYOUT_COMPONENT_TYPE,
    type NodeKindLike,
    nodeKindOf,
    type OutlineNodeKind,
} from "$shared/services/outlineNodeKind";

/**
 * `DataTransfer` type carried by a Layout child being reordered inside its own
 * Layout. Naming it lets the block claim exactly those drags (see
 * services/dnd/blockDndOwnership) while an outliner item dragged in from the
 * page still belongs to the host item's normal drop handling.
 */
export const LAYOUT_CHILD_DND_TYPE = "application/x-layout-child";

/** Fixed number of equal tracks a Layout lays its children out on. */
export const LAYOUT_COLUMN_COUNT = 12;

/** Span given to a child that has none: full width, the least surprising default. */
export const DEFAULT_COLUMN_SPAN = LAYOUT_COLUMN_COUNT;

/** True for a component type that renders as a visual block (Grid, Calendar, ...). */
export function isVisualComponentType(componentType: string | undefined): boolean {
    return isVisualLeafNode({ componentType });
}

/** True for the Layout container's own component type. */
export function isLayoutComponentType(componentType: string | undefined): boolean {
    return isLayoutNode({ componentType });
}

/**
 * True when an item with this component type may be a *direct* child of a
 * Layout. Ordinary text items and nested Layouts are rejected by the shared
 * child rule, which is the single place the constraint is expressed.
 */
export function canBeLayoutChild(componentType: string | undefined): boolean {
    return canAcceptChild({ componentType: LAYOUT_COMPONENT_TYPE }, { componentType });
}

/**
 * Repair a persisted span into the renderable range instead of trusting it: a
 * value written by an older or buggier client, or by a concurrent edit, must
 * not be able to break the grid. Non-integers are floored, anything outside
 * 1..12 is clamped, and anything unusable falls back to the default.
 */
export function normalizeColumnSpan(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_COLUMN_SPAN;
    const floored = Math.floor(value);
    if (floored < 1) return 1;
    if (floored > LAYOUT_COLUMN_COUNT) return LAYOUT_COLUMN_COUNT;
    return floored;
}

/** The component types a Layout accepts, for UI that has to enumerate them. */
export function visualComponentTypes(): string[] {
    return [GRID_COMPONENT_TYPE, CALENDAR_COMPONENT_TYPE];
}
