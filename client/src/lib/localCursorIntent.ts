// Explicit local cursor/selection changes (issue #5311, REQ-014).
//
// A pending Diagram-involving composition is bound to the cursor set, targets
// and selections captured when it started. Any *explicit* local change of
// those — placing or adding a caret, moving one, changing a selection — must
// cancel it before the change takes effect. Rebasing a caret after a remote
// edit is not an explicit change, so it never goes through here.

type Listener = () => void;

const listeners = new Set<Listener>();
let suppressed = 0;

export function onLocalCursorIntent(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** Announce an explicit local cursor, target or selection change. */
export function notifyLocalCursorIntent(): void {
    if (suppressed > 0) return;
    for (const listener of Array.from(listeners)) listener();
}

/**
 * Run cursor bookkeeping that is part of an already-accepted command (moving
 * carets to where a committed edit left them) without it counting as a new
 * explicit change.
 */
export function withoutLocalCursorIntent<T>(fn: () => T): T {
    suppressed++;
    try {
        return fn();
    } finally {
        suppressed--;
    }
}
