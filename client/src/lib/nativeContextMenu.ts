/**
 * Shift+right-click is reserved for the browser's native context menu (#5407).
 *
 * A user-initiated secondary-button pointer press (`button === 2`) with Shift
 * held must yield to the browser's native `contextmenu` default action on every
 * Outliner-managed surface: no Outliner handler may cancel it, suppress it
 * through another event in the gesture, or open an application menu for it.
 * This holds regardless of read/write access, node kind, containing block, or
 * additional held modifiers.
 *
 * What this deliberately does NOT match:
 * - Shift+primary-button (`button === 0`): Shift+click selection stays intact.
 * - Touch long-press: touch pointers never report the secondary button.
 * - Keyboard activation (`Shift+F10`, the `ContextMenu` key): keyboard events
 *   carry no `button`, so they keep opening application menus.
 */
export interface NativeMenuGesture {
    readonly button?: number;
    readonly shiftKey?: boolean;
}

export function shouldYieldToNativeContextMenu(event: NativeMenuGesture): boolean {
    return event.button === 2 && event.shiftKey === true;
}
