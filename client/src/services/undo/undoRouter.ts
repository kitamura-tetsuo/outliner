import * as Y from "yjs";

/**
 * Tracks Y.UndoManager instances by operation sequence to provide a single, unified
 * undo/redo stack across multiple documents and scopes (like the outline and tables).
 */
export class UndoRouter {
    private undoStack: Y.UndoManager[] = [];
    private redoStack: Y.UndoManager[] = [];

    // We hold a mapping to easily unregister or cleanup
    private registered = new Set<Y.UndoManager>();

    // We store the handler bound to `this` so we can remove it later
    private handlers = new WeakMap<Y.UndoManager, (event: { type: "undo" | "redo"; }) => void>();

    // Yjs emits stack-cleared events when a new operation interrupts a redo stack
    private clearHandlers = new WeakMap<
        Y.UndoManager,
        (event: { undoStackCleared: boolean; redoStackCleared: boolean; }) => void
    >();

    // Track state to distinguish user operations from our router's undo/redo calls
    private isUndoing = false;
    private isRedoing = false;

    public register(um: Y.UndoManager): void {
        if (this.registered.has(um)) return;
        this.registered.add(um);

        const onAdded = (event: { type: "undo" | "redo"; }) => {
            if (this.isUndoing || this.isRedoing) {
                // If the router is actively driving an undo or redo, we manage the global stacks
                // directly in those methods. We ignore the events triggered by the manager itself.
                return;
            }

            if (event.type === "undo") {
                // A new user operation was added.
                this.undoStack.push(um);
                // When a new operation happens, the global redo stack must be cleared.
                // Note: The individual UndoManagers will clear their own redo stacks,
                // and might emit stack-cleared, but it's safest to just clear our global one here.
                this.redoStack = [];
            }
        };

        const onCleared = (event: { undoStackCleared: boolean; redoStackCleared: boolean; }) => {
            // When an UndoManager is cleared entirely, we don't necessarily remove everything
            // from the global stack unless we want to rebuild it, but normally Y.UndoManager
            // only clears the redo stack on new changes, or undo/redo stacks when explicitly cleared.
            // If the redoStack is cleared (undoStackCleared is false), then we don't have to do
            // much because we already clear the global redo stack in `onAdded` for "undo".
            if (event.undoStackCleared) {
                this.undoStack = this.undoStack.filter(m => m !== um);
            }
            if (event.redoStackCleared) {
                this.redoStack = this.redoStack.filter(m => m !== um);
            }
        };

        this.handlers.set(um, onAdded);
        this.clearHandlers.set(um, onCleared);

        um.on("stack-item-added", onAdded);
        um.on("stack-cleared", onCleared);
    }

    public unregister(um: Y.UndoManager): void {
        if (!this.registered.has(um)) return;

        const onAdded = this.handlers.get(um);
        if (onAdded) um.off("stack-item-added", onAdded);

        const onCleared = this.clearHandlers.get(um);
        if (onCleared) um.off("stack-cleared", onCleared);

        this.registered.delete(um);
        this.handlers.delete(um);
        this.clearHandlers.delete(um);

        // Entries for a destroyed scope do not break later undos
        this.undoStack = this.undoStack.filter(item => item !== um);
        this.redoStack = this.redoStack.filter(item => item !== um);
    }

    public undo(): void {
        const um = this.undoStack.pop();
        if (um) {
            this.isUndoing = true;
            try {
                um.undo();
                this.redoStack.push(um);
            } finally {
                this.isUndoing = false;
            }
        }
    }

    public redo(): void {
        const um = this.redoStack.pop();
        if (um) {
            this.isRedoing = true;
            try {
                um.redo();
                this.undoStack.push(um);
            } finally {
                this.isRedoing = false;
            }
        }
    }
}

export const globalUndoRouter = new UndoRouter();
