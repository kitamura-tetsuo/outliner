/**
 * The outline's node-kind model (#5015).
 *
 * An outline node has exactly one *stable semantic kind*. A visual node is not
 * a Text node with extra rendering state, and no ordinary user action turns one
 * kind into another:
 *
 * ```text
 * Text      text + normal outline children
 * Grid      gridId, no text, leaf
 * Calendar  calendarId, no text, leaf
 * Layout    no text, container of visual children only
 * ```
 *
 * The kind is still *stored* in the pre-existing `componentType` field — this
 * module gives that field exclusive, kind-specific semantics rather than
 * renaming it repository-wide. Everything that has to ask "what is this node,
 * and what may it hold?" asks here, so the rules exist in one place instead of
 * as scattered `componentType === "yjstable"` comparisons.
 *
 * Framework-neutral on purpose: the Yjs schema (`app-schema.ts`) enforces the
 * text-ownership rule with it, and the client's editor, drag & drop, indent and
 * clipboard paths enforce the tree rules with it.
 */

/** `Item.componentType` of a Grid node. Historic name of the Grid block. */
export const GRID_COMPONENT_TYPE = "yjstable";

/** `Item.componentType` of a Calendar node. */
export const CALENDAR_COMPONENT_TYPE = "calendar";

/** `Item.componentType` of a Layout container. */
export const LAYOUT_COMPONENT_TYPE = "layout";

/** The semantic kinds an outline node can have. */
export type OutlineNodeKind = "text" | "grid" | "calendar" | "layout";

/**
 * The single registry mapping stored discriminator to semantic kind. A future
 * visual block (Chart, Image, ...) joins the model by adding one entry here and
 * one to `VISUAL_KINDS` — not by adding comparisons across the editor.
 */
const KIND_BY_COMPONENT_TYPE: ReadonlyMap<string, OutlineNodeKind> = new Map([
    [GRID_COMPONENT_TYPE, "grid" as const],
    [CALENDAR_COMPONENT_TYPE, "calendar" as const],
    [LAYOUT_COMPONENT_TYPE, "layout" as const],
]);

/** Kinds that render as a self-contained visual block and may sit in a Layout. */
const VISUAL_LEAF_KINDS: ReadonlySet<OutlineNodeKind> = new Set(["grid", "calendar"]);

/** Anything that stores a node kind: the Yjs `Item`, or a plain test double. */
export interface NodeKindLike {
    componentType?: string;
}

/** The kind a stored `componentType` denotes. Anything unknown reads as Text. */
export function nodeKindOfComponentType(componentType: string | undefined): OutlineNodeKind {
    if (componentType === undefined) return "text";
    return KIND_BY_COMPONENT_TYPE.get(componentType) ?? "text";
}

/**
 * The kind of a node. Reading `componentType` off a concurrently deleted Yjs
 * node can throw, and a node whose kind cannot be read is treated as Text —
 * the kind with the *narrowest* privileges, so a failed read can never be what
 * lets an invalid tree through.
 */
export function nodeKindOf(item: NodeKindLike | undefined): OutlineNodeKind {
    if (!item) return "text";
    try {
        return nodeKindOfComponentType(item.componentType);
    } catch {
        return "text";
    }
}

/** True for the Text kind: the only kind that owns ordinary outline text. */
export function isTextNode(item: NodeKindLike | undefined): boolean {
    return nodeKindOf(item) === "text";
}

/** True for a Grid/Calendar/Layout node — anything that is not ordinary text. */
export function isVisualNode(item: NodeKindLike | undefined): boolean {
    return !isTextNode(item);
}

/** True for a Grid or Calendar leaf: a visual block, not the Layout container. */
export function isVisualLeafNode(item: NodeKindLike | undefined): boolean {
    return VISUAL_LEAF_KINDS.has(nodeKindOf(item));
}

/** True for the Layout container. */
export function isLayoutNode(item: NodeKindLike | undefined): boolean {
    return nodeKindOf(item) === "layout";
}

/** True when this kind owns editable outline text. Only Text does. */
export function ownsOutlineText(item: NodeKindLike | undefined): boolean {
    return isTextNode(item);
}

/** True when nodes of this kind may have children at all. Grid/Calendar are leaves. */
export function canNodeHaveChildren(item: NodeKindLike | undefined): boolean {
    const kind = nodeKindOf(item);
    return kind === "text" || kind === "layout";
}

/**
 * The one tree rule every move, drop, indent and paste consults: may `child`
 * become a *direct* child of `parent`?
 *
 * - Text accepts any node kind (an outline may hold a Grid under a heading);
 * - Grid and Calendar accept nothing — they are leaves;
 * - Layout accepts only visual leaves, which keeps nested Layout invalid
 *   without a special case.
 *
 * An absent parent means the page root, which behaves like a Text container.
 */
export function canAcceptChild(parent: NodeKindLike | undefined, child: NodeKindLike | undefined): boolean {
    const parentKind = parent === undefined ? "text" : nodeKindOf(parent);
    if (parentKind === "text") return true;
    if (parentKind === "layout") return isVisualLeafNode(child);
    return false;
}

/**
 * True when a `componentType` write is a *creation*, not a kind mutation.
 *
 * A node is born with `componentType === undefined` and may be stamped once,
 * while it is still blank. Re-stamping a node that already has a kind — Grid to
 * Calendar, Layout back to Text — is what this model rules out, so the schema
 * refuses it rather than trusting every call site to.
 */
export function isAllowedKindWrite(current: string | undefined, next: string | undefined): boolean {
    if (current === next) return true;
    return nodeKindOfComponentType(current) === "text" && current === undefined;
}
