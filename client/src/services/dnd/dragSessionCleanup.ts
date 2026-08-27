// Every drag surface (OutlinerItem, LayoutBlock, Sidebar, ...) owns local
// transient state for its own drop-target highlight, and already clears it
// from its own `drop`/`dragleave`/`dragend` handlers. That is enough while
// the DOM involved in the gesture stays put, but a completed move can
// reparent or remove the dragged node (or the node a highlight is showing
// on) before the browser delivers every event a component was relying on —
// `dragend` in particular fires on the original drag-source node, and a
// detached node cannot bubble an event up to `window`. Drag feedback must
// never outlive the gesture regardless, so this module is the shared,
// final cleanup path every drag surface can register with (#5123).
//
// A single capture-phase listener on `window` observes every `drop` and
// `dragend` in the document. Capture fires before any handler further down
// the tree gets a chance to call `stopPropagation()`, and — unlike a
// bubble-phase listener — it does not depend on the event reaching `window`
// by bubbling through a node that may since have been detached from the
// document. The actual broadcast is deferred to a microtask so a drop
// target's own handler (which may still need to synchronously read its own
// transient state, e.g. across an in-flight `await`) finishes first.

/** Fired once a drag gesture has definitively ended (drop or dragend). */
export const DRAG_SESSION_CLEAR_EVENT = "outliner:drag-session-clear";

let watcherInstalled = false;

function scheduleClear(): void {
    queueMicrotask(() => {
        window.dispatchEvent(new CustomEvent(DRAG_SESSION_CLEAR_EVENT));
    });
}

function ensureDragSessionWatcher(): void {
    if (watcherInstalled) return;
    watcherInstalled = true;
    window.addEventListener("drop", scheduleClear, true);
    window.addEventListener("dragend", scheduleClear, true);
}

/**
 * Registers a callback that resets one drag surface's own transient
 * drop-indicator state whenever any drag gesture in the document ends.
 * Returns an unregister function to call on teardown.
 */
export function onDragSessionClear(callback: () => void): () => void {
    ensureDragSessionWatcher();
    window.addEventListener(DRAG_SESSION_CLEAR_EVENT, callback);
    return () => window.removeEventListener(DRAG_SESSION_CLEAR_EVENT, callback);
}
