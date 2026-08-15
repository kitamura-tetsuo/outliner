import * as Y from "yjs";
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
 *
 * The two stacks are `$state` so that `canUndo()` / `canRedo()` can be read
 * from a `$derived` in a component and the toolbar buttons enable and disable
 * themselves as history is recorded and consumed. Svelte only proxies plain
 * objects and arrays, so the `Y.UndoManager` entries themselves are stored as
 * they are and identity comparisons keep working.
 */
import type { ScheduleRuleValueType } from "$shared/types/yjs-types";
import { rollbackCrossProjectPaste } from "../clipboard/crossProjectGridPaste";
import {
    captureClonedScheduleRules,
    restoreClonedScheduleRules,
    rollbackClonedScheduleRules,
} from "../schedule/scheduleRuleClone";
import { getTableRegistry } from "../yjstable/tableDocs";
import { tableDocGuid } from "../yjstable/tableDocs";

export interface CompositeUndoEntry {
    type: "composite";
    mainManager: Y.UndoManager;
    projectDoc: Y.Doc;
    createdTableIds: string[];
    savedRegistryEntries: Record<
        string,
        { name: string; sqlName: string; sourceProjectId?: string; sourceTableId?: string; }
    >;
    savedSubdocStates: Record<string, Uint8Array>;
    /** Schedule rules the paste copied, and enough of each to put it back. */
    createdRuleIds: string[];
    savedRules: Record<string, Record<string, ScheduleRuleValueType>>;
}

export type UndoRouterEntry = Y.UndoManager | CompositeUndoEntry;

export class UndoRouter {
    private undoStack: UndoRouterEntry[] = $state([]);
    private redoStack: UndoRouterEntry[] = $state([]);

    // Bookkeeping only: nothing renders from the set of registered scopes, so a
    // reactive SvelteSet would buy nothing. Availability is derived from the two
    // stacks above, which drop a scope's entries when it unregisters.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- see above
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
        this.run(this.undoStack, this.redoStack, (um) => um.undo(), true);
    }

    /** Restore the most recently undone operation. */
    public redo(): void {
        this.run(this.redoStack, this.undoStack, (um) => um.redo(), false);
    }

    /**
     * Group a cross-project paste into a single entry that can be cleanly
     * undone and redone as one unit.
     */
    public captureCrossProjectPaste(
        mainManager: Y.UndoManager,
        projectDoc: Y.Doc,
        createdTableIds: string[],
        createdRuleIds: string[] = [],
    ): void {
        if (this.undoStack.length === 0) return;
        const top = this.undoStack[this.undoStack.length - 1];
        if (top === mainManager) {
            const savedRegistryEntries: CompositeUndoEntry["savedRegistryEntries"] = {};
            const savedSubdocStates: Record<string, Uint8Array> = {};
            const registry = getTableRegistry(projectDoc);

            for (const tableId of createdTableIds) {
                const entry = registry.get(tableId);
                if (entry) {
                    const sourceProjectId = entry.get("sourceProjectId");
                    const sourceTableId = entry.get("sourceTableId");
                    savedRegistryEntries[tableId] = {
                        name: String(entry.get("name") ?? ""),
                        sqlName: String(entry.get("sqlName") ?? ""),
                        // Provenance decides whether a later paste of the same
                        // clipboard reuses this table or makes another; a redone
                        // paste that lost it would silently start duplicating.
                        ...(typeof sourceProjectId === "string" ? { sourceProjectId } : {}),
                        ...(typeof sourceTableId === "string" ? { sourceTableId } : {}),
                    };
                    const subdoc = entry.get("doc");
                    if (subdoc instanceof Y.Doc) {
                        savedSubdocStates[tableId] = Y.encodeStateAsUpdate(subdoc);
                    }
                }
            }

            this.undoStack[this.undoStack.length - 1] = {
                type: "composite",
                mainManager,
                projectDoc,
                createdTableIds,
                savedRegistryEntries,
                savedSubdocStates,
                createdRuleIds,
                savedRules: captureClonedScheduleRules(projectDoc, createdRuleIds),
            };
        }
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
        from: UndoRouterEntry[],
        to: UndoRouterEntry[],
        apply: (um: Y.UndoManager) => unknown,
        isUndo: boolean,
    ): void {
        this.routing = true;
        try {
            while (from.length > 0) {
                const entry = from.pop();
                if (!entry) continue;

                if ("type" in entry && entry.type === "composite") {
                    if (apply(entry.mainManager)) {
                        if (isUndo) {
                            rollbackClonedScheduleRules(entry.projectDoc, entry.createdRuleIds);
                            rollbackCrossProjectPaste(entry.projectDoc, entry.createdTableIds);
                        } else {
                            const registry = getTableRegistry(entry.projectDoc);
                            entry.projectDoc.transact(() => {
                                for (const tableId of entry.createdTableIds) {
                                    const savedRegistry = entry.savedRegistryEntries[tableId];
                                    const savedState = entry.savedSubdocStates[tableId];
                                    if (savedRegistry && savedState) {
                                        const subdoc = new Y.Doc({
                                            guid: tableDocGuid(entry.projectDoc.guid, tableId),
                                            autoLoad: true,
                                        });
                                        Y.applyUpdate(subdoc, savedState);
                                        const mapEntry = new Y.Map<unknown>();
                                        mapEntry.set("name", savedRegistry.name);
                                        mapEntry.set("sqlName", savedRegistry.sqlName);
                                        if (savedRegistry.sourceProjectId !== undefined) {
                                            mapEntry.set("sourceProjectId", savedRegistry.sourceProjectId);
                                        }
                                        if (savedRegistry.sourceTableId !== undefined) {
                                            mapEntry.set("sourceTableId", savedRegistry.sourceTableId);
                                        }
                                        mapEntry.set("doc", subdoc);
                                        registry.set(tableId, mapEntry);
                                    }
                                }
                            });
                            restoreClonedScheduleRules(entry.projectDoc, entry.savedRules);
                        }
                        to.push(entry);
                        return;
                    }
                } else {
                    const um = entry as Y.UndoManager;
                    if (apply(um)) {
                        to.push(um);
                        return;
                    }
                }
            }
        } finally {
            this.routing = false;
        }
    }
}

export const globalUndoRouter = new UndoRouter();
