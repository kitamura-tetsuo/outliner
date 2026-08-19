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
 * The visual-component registry lives here so future blocks (Chart, Image, ...)
 * become Layout-eligible by joining one set rather than by adding
 * `type === "calendar" || type === "yjstable"` checks across the editor.
 */

/** `Item.componentType` of a Layout container. */
export const LAYOUT_COMPONENT_TYPE = "layout";

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

/**
 * Component types that render as a self-contained visual block and may
 * therefore sit directly inside a Layout. A Layout is itself *not* in this set:
 * nested Layouts are out of scope (#4997), and keeping it out means the child
 * predicate rejects them without a special case.
 */
const VISUAL_COMPONENT_TYPES: ReadonlySet<string> = new Set(["yjstable", "calendar"]);

/** True for a component type that renders as a visual block (Grid, Calendar, ...). */
export function isVisualComponentType(componentType: string | undefined): boolean {
    return componentType !== undefined && VISUAL_COMPONENT_TYPES.has(componentType);
}

/** True for the Layout container's own component type. */
export function isLayoutComponentType(componentType: string | undefined): boolean {
    return componentType === LAYOUT_COMPONENT_TYPE;
}

/**
 * True when an item with this component type may be a *direct* child of a
 * Layout. Ordinary text items (no component type) and nested Layouts are
 * rejected here, which is the single place the constraint is expressed.
 */
export function canBeLayoutChild(componentType: string | undefined): boolean {
    return isVisualComponentType(componentType);
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
    return [...VISUAL_COMPONENT_TYPES];
}
