/**
 * Shift+right-click native context-menu escape (issue #5407).
 *
 * A secondary-button pointer click with Shift held must yield to the
 * browser's own context menu on every Outliner-managed surface: no
 * Outliner handler may cancel the native `contextmenu` default action,
 * suppress it through another event in the gesture, or open an Outliner
 * menu for it. Ordinary right-clicks and keyboard menu activation
 * (`Shift+F10`, the `ContextMenu` key) keep their application menus.
 */

/**
 * True for a `contextmenu` event that belongs to the Shift+right-click
 * escape gesture. `contextmenu` is only dispatched for secondary-button
 * (or keyboard) activation, so a held Shift is the whole signal here;
 * `button` is deliberately not consulted because engines differ in what
 * they report on this event and synthetic keyboard activations never
 * carry Shift. Keyboard `Shift+F10` activation arrives as a `KeyboardEvent`
 * through separate keydown handlers, never through this predicate.
 */
export function isNativeContextMenuEvent(event: MouseEvent): boolean {
    return event.shiftKey === true;
}

/**
 * True for a press-phase pointer/mouse event (`pointerdown`, `mousedown`)
 * that starts the Shift+right-click escape gesture. Unlike the
 * `contextmenu` predicate above, the press phase needs the explicit
 * secondary-button check so Shift+primary-button selection stays inert.
 * This path also covers engines (e.g. Firefox) that show the native menu
 * for Shift+right-click without dispatching a DOM `contextmenu` event at
 * all: dismissing already-open application menus must not wait for an
 * event that never arrives.
 */
export function isShiftSecondaryPointerPress(event: MouseEvent | PointerEvent): boolean {
    return event.shiftKey === true && event.button === 2;
}
