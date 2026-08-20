/**
 * Keeping the outline caret (and, on phones, the software keyboard) alive while
 * the user presses a toolbar button.
 *
 * Focus normally moves to the button on pointer-down, which blurs the global
 * textarea; on mobile that closes the keyboard and the user loses their place.
 * Buttons that act on the item currently being edited therefore suppress the
 * focus shift and mark themselves with `data-keep-editor-focus` so
 * `GlobalTextArea`'s blur guard knows to restore focus rather than treating the
 * button as a deliberate move away from the editor.
 */

/** Attribute marking a control that must not take focus away from the editor. */
export const KEEP_EDITOR_FOCUS_ATTR = "data-keep-editor-focus";

/** True when `element` (or an ancestor) is such a control. */
export function keepsEditorFocus(element: Element | null | undefined): boolean {
    return !!element?.closest(`[${KEEP_EDITOR_FOCUS_ATTR}]`);
}

/**
 * Pointer-down handler for those controls: cancelling the default action stops
 * the browser from focusing the button, so the textarea never blurs at all.
 */
export function preventEditorBlur(event: Event): void {
    if (event instanceof PointerEvent && event.button === 2) return;
    if (event instanceof MouseEvent && event.button === 2) return;
    event.preventDefault();
}

/** Re-assert focus on the global textarea, for paths where it was lost anyway. */
export function restoreEditorFocus(): void {
    if (typeof document === "undefined") return;
    const textarea = document.querySelector(".global-textarea") as HTMLTextAreaElement | null;
    textarea?.focus({ preventScroll: true });
}
