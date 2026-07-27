import type * as Y from "yjs";
import { getLogger } from "../../lib/logger";

const logger = getLogger("undoRouter");

/**
 * A single undo/redo history across every Yjs scope of the workspace.
 *
 * Each scope (the outline's `orderedTree`, and one manager per table) keeps its
 * own `Y.UndoManager`. This router does not replace them: it records, per
 * operation, which scope the operation was applied to, and delegates undo/redo
 * to that scope. `undoStack`/`redoStack` therefore hold manager references in
 * the order the operations happened; because each manager pops its own internal
 * stack in LIFO order, popping the router stack addresses exactly the operation
 * that comes next in reverse chronological order.
 *
 * The router must be the sole entry point. If anything calls `undo()` on a
 * scope directly, that scope's internal stack advances while the router's does
 * not, and the two desynchronize. Such a call is detected here (the "redo"
 * branch in `register`) and repaired, but the correct fix is always to route
 * the call through the router.
 *
 * Scope lifetime: entries of a destroyed scope are dropped, not revived. A
 * table that has been torn down cannot replay its inverse operations, so its
 * history leaves the global stack with it and the remaining entries stay usable.
 */
export class UndoRouter {
    private undoStack: Y.UndoManager[] = [];
    private redoStack: Y.UndoManager[] = [];

    private registered = new Set<Y.UndoManager>();

    // Handlers are kept per manager so they can be detached on unregister.
    private addedHandlers = new WeakMap<Y.UndoManager, (event: { type: "undo" | "redo"; }) => void>();
    private clearedHandlers = new WeakMap<
        Y.UndoManager,
        (event: { undoStackCleared: boolean; redoStackCleared: boolean; }) => void
    >();

    /** True while the router itself drives a scope, so its events are ignored. */
    private routing = false;

    public register(um: Y.UndoManager): void {
        if (this.registered.has(um)) return;
        this.registered.add(um);

        const onAdded = (event: { type: "undo" | "redo"; }) => {
            // Events raised by our own undo()/redo() are already accounted for
            // by those methods.
            if (this.routing) return;

            if (event.type === "undo") {
                // A new operation. Yjs merges consecutive operations of the same
                // manager into a single stack item while it is still capturing,
                // which would make one entry stand for two operations separated
                // in time by an operation in another scope. Close the capture
                // window of the other scopes so their next operation starts a
                // fresh stack item and chronological order is preserved. Nothing
                // happens while only one scope is being edited, so outline-only
                // behavior is unchanged.
                for (const other of this.registered) {
                    if (other !== um) other.stopCapturing();
                }
                this.undoStack.push(um);
                // A new operation invalidates the redo history, exactly as it
                // does inside a single Y.UndoManager.
                this.redoStack = [];
            } else {
                // A scope pushed a redo item without the router asking for it,
                // which means undo() was called on that scope directly. Repair
                // the router's view so later undos stay aligned.
                logger.warn(
                    "Undo was invoked on a scope directly; the global undo router is the only supported entry point.",
                );
                const last = this.undoStack.lastIndexOf(um);
                if (last !== -1) this.undoStack.splice(last, 1);
                this.redoStack.push(um);
            }
        };

        const onCleared = (event: { undoStackCleared: boolean; redoStackCleared: boolean; }) => {
            // Emitted when a manager drops history of its own accord — notably
            // when a new operation clears its redo stack. Drop the matching
            // entries so the router never points at a stack item that is gone.
            if (event.undoStackCleared) {
                this.undoStack = this.undoStack.filter((entry) => entry !== um);
            }
            if (event.redoStackCleared) {
                this.redoStack = this.redoStack.filter((entry) => entry !== um);
            }
        };

        this.addedHandlers.set(um, onAdded);
        this.clearedHandlers.set(um, onCleared);

        um.on("stack-item-added", onAdded);
        um.on("stack-cleared", onCleared);
    }

    public unregister(um: Y.UndoManager): void {
        if (!this.registered.has(um)) return;

        const onAdded = this.addedHandlers.get(um);
        if (onAdded) um.off("stack-item-added", onAdded);

        const onCleared = this.clearedHandlers.get(um);
        if (onCleared) um.off("stack-cleared", onCleared);

        this.registered.delete(um);
        this.addedHandlers.delete(um);
        this.clearedHandlers.delete(um);

        this.undoStack = this.undoStack.filter((entry) => entry !== um);
        this.redoStack = this.redoStack.filter((entry) => entry !== um);
    }

    /** Reverse the most recent operation, whichever scope it belongs to. */
    public undo(): void {
        this.run(this.undoStack, this.redoStack, (um) => um.undo());
    }

    /** Restore the most recently undone operation. */
    public redo(): void {
        this.run(this.redoStack, this.undoStack, (um) => um.redo());
    }

    public canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    public canRedo(): boolean {
        return this.redoStack.length > 0;
    }

    /** Number of recorded operations. Exposed for tests and diagnostics. */
    public get undoDepth(): number {
        return this.undoStack.length;
    }

    public get redoDepth(): number {
        return this.redoStack.length;
    }

    /** Drop the whole history. */
    public clear(): void {
        this.undoStack = [];
        this.redoStack = [];
    }

    /**
     * Pop `from` until a scope actually applies the operation, then record it on
     * `to`. An entry whose scope has nothing left to apply is stale — its stack
     * item was dropped by Yjs — and is discarded rather than swallowing the
     * user's keystroke.
     */
    private run(
        from: Y.UndoManager[],
        to: Y.UndoManager[],
        apply: (um: Y.UndoManager) => unknown,
    ): void {
        this.routing = true;
        try {
            while (from.length > 0) {
                const um = from.pop();
                if (um && apply(um)) {
                    to.push(um);
                    return;
                }
            }
        } finally {
            this.routing = false;
        }
    }
}

export const globalUndoRouter = new UndoRouter();
