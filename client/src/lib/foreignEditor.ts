// Ownership marker for embedded editor surfaces.
//
// The outliner registers document-level keyboard and clipboard handlers. Native
// form controls are recognised by tag name (see `isForeignInput`), but a rich
// editor such as Monaco renders its own DOM: the focused node may be a hidden
// textarea, an `EditContext` div, or a widget button inside the editor chrome,
// and the keys it needs (Enter, Tab, Backspace, arrows, Ctrl+C/X/V/A/Z, Ctrl+F)
// are precisely the ones the outliner also binds.
//
// Rather than scattering `stopPropagation()` calls through the component tree,
// such an editor marks its root with `data-foreign-editor` and every outliner
// entry point treats anything inside that subtree as foreign. The marker is
// scoped to the editor root, so outline keyboard behaviour outside it is
// untouched.

/** Attribute a component puts on its root to claim keyboard/clipboard ownership. */
export const FOREIGN_EDITOR_ATTRIBUTE = "data-foreign-editor";

const FOREIGN_EDITOR_SELECTOR = `[${FOREIGN_EDITOR_ATTRIBUTE}]`;

/** True when the node sits inside an embedded editor that owns its own events. */
export function isInsideForeignEditor(target: EventTarget | null): boolean {
    if (!target) return false;
    const el = target as Element;
    return typeof el.closest === "function" && el.closest(FOREIGN_EDITOR_SELECTOR) !== null;
}
