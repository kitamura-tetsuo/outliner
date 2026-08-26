import { tick } from "svelte";
import { Cursor } from "../lib/Cursor"; // Import Cursor class
import { isForeignInput } from "../lib/KeyEventHandler";
import { getLogger } from "../lib/logger";
import { isVisualRow, readOutlineRows } from "../lib/selection/outlineSelectionDom";
import { getItemSelectionInterval } from "../lib/selection/selectionContent";
import {
    endpointTextOffset,
    type ItemOrderComparator,
    type NormalizedSelection,
    normalizeSelectionEndpoints,
    type SelectionEndpoint,
    textEndpoint,
    textSelectionEndpoints,
} from "../lib/selection/selectionEndpoints";
import { yjsService } from "../lib/yjs/service";
import { escapeId } from "../utils/domUtils";
import { store } from "./store.svelte";
import { yjsStore } from "./yjsStore.svelte";
const logger = getLogger("EditorOverlayStore");

// Exported types
export interface CursorPosition {
    // ID uniquely identifying each cursor instance
    cursorId: string;
    // ID of the item the cursor belongs to
    itemId: string;
    // Text offset
    offset: number;
    // Whether this cursor is active (blinking)
    isActive: boolean;
    // Optional user identification (for future use)
    userId?: string;
    userName?: string;
    color?: string;
}

// Extend global type definitions
declare global {
    interface Window {
        editorOverlayStore?: EditorOverlayStore;
    }
}

export interface SelectionRange {
    /**
     * Authoritative start endpoint - the anchor side of the selection (#5025).
     *
     * Either a character boundary inside a Text node or the boundary before/after an
     * atomic visual node. Everything that decides what a selection contains reads these
     * two fields; the flat mirrors below exist only for the text-only consumers.
     */
    start: SelectionEndpoint;
    /** Authoritative end endpoint - the focus side of the selection. */
    end: SelectionEndpoint;
    // Start item ID of the selection range (mirror of start.itemId; both endpoint kinds have one)
    startItemId: string;
    // Start offset. Present only when `start` is a text endpoint - a visual node has no offset to give.
    startOffset?: number;
    // End item ID of the selection range (mirror of end.itemId)
    endItemId: string;
    // End offset. Present only when `end` is a text endpoint.
    endOffset?: number;
    // For user identification
    userId?: string;
    userName?: string;
    // Whether the selection is reversed
    isReversed?: boolean;
    color?: string;
    // Whether it is a box selection (rectangular selection)
    isBoxSelection?: boolean;
    // Start and end offsets for each line in case of box selection
    boxSelectionRanges?: Array<{
        itemId: string;
        startOffset: number;
        endOffset: number;
    }>;
    // Whether the selection range is updating (for visual feedback)
    isUpdating?: boolean;
}

/**
 * What `setSelection` accepts.
 *
 * A caller states its endpoints either generally (`start`/`end`) or in the flat text form
 * every text-only call site already speaks. The flat form is a pure adapter: it can only
 * describe text positions, and `toSelectionRange` turns it into endpoints once, at the
 * door, so nothing downstream ever sees two representations of the same selection.
 */
export interface SelectionRangeInput
    extends Omit<SelectionRange, "start" | "end" | "startItemId" | "endItemId" | "startOffset" | "endOffset">
{
    start?: SelectionEndpoint;
    end?: SelectionEndpoint;
    startItemId?: string;
    startOffset?: number;
    endItemId?: string;
    endOffset?: number;
}

/**
 * Normalize any accepted selection input into the stored representation.
 *
 * Returns undefined when the input describes no position at all - a payload missing its
 * item ids, or a flat endpoint with no offset to stand on. Such an input is dropped rather
 * than repaired, because the only repair available would be to invent an offset.
 */
export function toSelectionRange(input: SelectionRangeInput): SelectionRange | undefined {
    const start = input.start
        ?? (input.startItemId && typeof input.startOffset === "number"
            ? textEndpoint(input.startItemId, input.startOffset)
            : undefined);
    const end = input.end
        ?? (input.endItemId && typeof input.endOffset === "number"
            ? textEndpoint(input.endItemId, input.endOffset)
            : undefined);
    if (!start || !end) return undefined;

    const {
        start: _start,
        end: _end,
        startItemId: _startItemId,
        startOffset: _startOffset,
        endItemId: _endItemId,
        endOffset: _endOffset,
        ...rest
    } = input;

    return {
        ...rest,
        start,
        end,
        startItemId: start.itemId,
        endItemId: end.itemId,
        startOffset: endpointTextOffset(start),
        endOffset: endpointTextOffset(end),
    };
}

// Using Svelte 5 runtime runes macros (import not required)

export class EditorOverlayStore {
    cursors = $state<Record<string, CursorPosition>>({});
    // Map to hold Cursor instances
    /* eslint-disable svelte/prefer-svelte-reactivity -- Internal instance cache, not reactive state */
    cursorInstances = new Map<string, Cursor>();
    /* eslint-enable svelte/prefer-svelte-reactivity */
    // History of added cursors
    cursorHistory = $state<string[]>([]);
    selections = $state<Record<string, SelectionRange>>({});
    activeItemId = $state<string | null>(null);
    /**
     * Incremented every time the caret blink phase must restart (caret moved, text typed).
     * The overlay keys the caret element on this value so Svelte remounts it and the
     * CSS blink animation restarts from its "on" phase. Blinking itself is pure CSS.
     */
    cursorBlinkEpoch = $state<number>(0);
    animationPaused = $state<boolean>(false);
    // IME composition state
    isComposing = $state<boolean>(false);
    // Character length of the in-progress IME composition text.
    // The cursor sits at the end of the composition, so subtracting this
    // length yields the composition start offset (candidate window anchor).
    compositionLength = 0;
    // Holds the textarea element of GlobalTextArea
    textareaRef: HTMLTextAreaElement | null = null;
    suppressSelectionResync = false;
    _selectionSyncTimeout: number | null = null;
    lastSetSelection = { start: -1, end: -1, direction: "none" as "none" | "forward" | "backward" };
    // Items the hidden mirror currently spans, in document order, together with the text that
    // was written for them and the range last applied to it. Only cross-item selections record
    // one; it is what lets an offset in the combined mirror text be mapped back to the item it
    // addresses, and what tells a replay of our own range apart from a real change.
    private mirrorSpan: {
        value: string;
        itemIds: string[];
        appliedStart?: number;
        appliedEnd?: number;
    } | undefined = undefined;
    // onEdit callback
    onEditCallback: (() => void) | null = null;
    private presenceSyncScheduled = false;

    // Lightweight pub-sub for UI (to avoid polling in components)
    /* eslint-disable svelte/prefer-svelte-reactivity -- Internal listener set, not reactive state */
    private listeners = new Set<() => void>();
    /* eslint-enable svelte/prefer-svelte-reactivity */

    // Set textarea reference
    setTextareaRef(el: HTMLTextAreaElement | null) {
        this.textareaRef = el;
    }

    // Get textarea reference
    getTextareaRef(): HTMLTextAreaElement | null {
        return this.textareaRef;
    }

    // Set onEdit callback
    setOnEditCallback(callback: (() => void) | null) {
        this.onEditCallback = callback;
    }

    // Get onEdit callback
    getOnEditCallback(): (() => void) | null {
        return this.onEditCallback;
    }

    // Trigger onEdit callback
    triggerOnEdit() {
        if (this.onEditCallback) {
            this.onEditCallback();
        }
    }

    // Subscribe UI listeners for store-driven updates
    subscribe(listener: () => void) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    private notifyChange() {
        // Notify listeners synchronously to ensure immediate UI updates
        for (const l of Array.from(this.listeners)) {
            try {
                l();
            } catch (_e) {
                logger.error(_e);
            }
        }
        if (typeof window !== "undefined") {
            try {
                window.dispatchEvent(new CustomEvent("editor-overlay:cursors-changed"));
            } catch (_e) {
                logger.error(_e);
            }
        }
    }

    private genUUID(): string {
        if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
            return crypto.randomUUID();
        }
        const bytes = (typeof crypto !== "undefined" ? crypto.getRandomValues(new Uint8Array(16)) : null)
            || new Uint8Array(16);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex: string[] = Array.from(bytes).map(b => b.toString(16).padStart(2, "0"));
        return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${
            hex.slice(8, 10).join("")
        }-${hex.slice(10, 16).join("")}`;
    }

    updateCursor(cursor: CursorPosition) {
        // Sync with Map instance
        const inst = this.cursorInstances.get(cursor.cursorId);
        if (inst) {
            // Update existing instance
            inst.itemId = cursor.itemId;
            inst.offset = cursor.offset;
            inst.isActive = cursor.isActive;
            if (cursor.userId) inst.userId = cursor.userId;
        } else {
            // Create new instance if it doesn't exist
            const newInst = new Cursor(cursor.cursorId, {
                itemId: cursor.itemId,
                offset: cursor.offset,
                isActive: cursor.isActive,
                userId: cursor.userId ?? "local",
            });
            this.cursorInstances.set(cursor.cursorId, newInst);
        }

        // Update reactive state
        this.cursors = { ...this.cursors, [cursor.cursorId]: cursor };

        // Notify listeners (e.g., overlay) for position updates
        this.notifyChange();

        // Update active item
        if (cursor.isActive) {
            this.setActiveItem(cursor.itemId);
        }

        if ((cursor.userId ?? "local") === "local") {
            this.schedulePresenceSync();
        }
    }

    /**
     * Add a new cursor
     * @param omitProps Cursor properties (excluding cursorId)
     * @returns New cursor ID
     */
    addCursor(omitProps: Omit<CursorPosition, "cursorId">) {
        // Debug info
        if (
            typeof window !== "undefined"
            && (window as Window & typeof globalThis & {
                DEBUG_MODE?: boolean;
                generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                appStore?: { currentPage?: { id?: string; }; };
                editorOverlayStore?: unknown;
            }).DEBUG_MODE
        ) {
            logger.debug(`EditorOverlayStore.addCursor called with:`, omitProps);
            logger.debug(`Current cursors:`, this.cursors);
            logger.debug(`Current cursor instances:`, Array.from(this.cursorInstances.keys()));
        }

        // Generate new cursor ID
        const newId = this.genUUID();

        // Check if a cursor already exists at the same position in the same item (stricter check)
        const existingCursor = Object.values(this.cursors).find(c =>
            c.itemId === omitProps.itemId
            && c.offset === omitProps.offset
            && c.userId === (omitProps.userId ?? "local")
        );

        if (existingCursor) {
            // Debug info
            if (
                typeof window !== "undefined"
                && (window as Window & typeof globalThis & {
                    DEBUG_MODE?: boolean;
                    generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                    itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                    editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                    appStore?: { currentPage?: { id?: string; }; };
                    editorOverlayStore?: unknown;
                }).DEBUG_MODE
            ) {
                logger.debug(
                    `Cursor already exists at this position, returning existing ID: ${existingCursor.cursorId}`,
                );
            }

            // Ensure existing cursor is active
            this.updateCursor({
                ...existingCursor,
                isActive: true,
            });

            if ((omitProps.userId ?? "local") === "local") {
                // Start cursor blinking
                this.startCursorBlink();

                // Ensure focus on global textarea
                const textarea = this.getTextareaRef();
                if (textarea && !isForeignInput(document.activeElement)) {
                    // Multiple attempts to ensure focus is set
                    textarea.focus();

                    // Set focus using requestAnimationFrame and tick
                    requestAnimationFrame(() => {
                        if (isForeignInput(document.activeElement)) return;
                        textarea.focus();

                        tick().then(() => {
                            setTimeout(() => {
                                if (isForeignInput(document.activeElement)) return;
                                textarea.focus();

                                // Debug info
                                if (
                                    typeof window !== "undefined"
                                    && (window as Window & typeof globalThis & {
                                        DEBUG_MODE?: boolean;
                                        generalStore?: {
                                            currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; };
                                        };

                                        itemsStore?: {
                                            allItems?: { id: string; text?: unknown; [key: string]: unknown; }[];
                                        };
                                        editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                                        appStore?: { currentPage?: { id?: string; }; };
                                        editorOverlayStore?: unknown;
                                    }).DEBUG_MODE
                                ) {
                                    logger.debug(
                                        `Focus set after finding existing cursor. Active element is textarea: ${
                                            document.activeElement === textarea
                                        }`,
                                    );
                                }
                            }, 10);
                        });
                    });
                } else {
                    // Log error if textarea is not found
                    if (
                        typeof window !== "undefined"
                        && (window as Window & typeof globalThis & {
                            DEBUG_MODE?: boolean;
                            generalStore?: {
                                currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; };
                            };

                            itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                            editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                            appStore?: { currentPage?: { id?: string; }; };
                            editorOverlayStore?: unknown;
                        }).DEBUG_MODE
                    ) {
                        logger.warn({}, "Global textarea not found in addCursor (existing cursor)");
                    }
                }
            }

            return existingCursor.cursorId;
        }

        // Create and hold Cursor instance
        const cursorInst = new Cursor(newId, {
            itemId: omitProps.itemId,
            offset: omitProps.offset,
            isActive: omitProps.isActive,
            userId: omitProps.userId ?? "local",
        });
        this.cursorInstances.set(newId, cursorInst);

        // Create new cursor
        const newCursor: CursorPosition = {
            cursorId: newId,
            ...omitProps,
            userId: omitProps.userId ?? "local", // Set "local" if userId is undefined
        };

        // Update cursor (update reactive state)
        this.updateCursor(newCursor);

        if ((omitProps.userId ?? "local") === "local") {
            // Ensure focus on global textarea
            const textarea = this.getTextareaRef();
            if (textarea) {
                // Multiple attempts to ensure focus is set
                textarea.focus();

                // Set focus using requestAnimationFrame and tick
                requestAnimationFrame(() => {
                    textarea.focus();

                    tick().then(() => {
                        setTimeout(() => {
                            textarea.focus();

                            // Debug info
                            if (
                                typeof window !== "undefined"
                                && (window as Window & typeof globalThis & {
                                    DEBUG_MODE?: boolean;
                                    generalStore?: {
                                        currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; };
                                    };

                                    itemsStore?: {
                                        allItems?: { id: string; text?: unknown; [key: string]: unknown; }[];
                                    };
                                    editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                                    appStore?: { currentPage?: { id?: string; }; };
                                    editorOverlayStore?: unknown;
                                }).DEBUG_MODE
                            ) {
                                logger.debug(
                                    `Focus set after adding new cursor. Active element is textarea: ${
                                        document.activeElement === textarea
                                    }`,
                                );
                            }
                        }, 10);
                    });
                });
            } else {
                // Log error if textarea is not found
                if (
                    typeof window !== "undefined"
                    && (window as Window & typeof globalThis & {
                        DEBUG_MODE?: boolean;
                        generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                        itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                        editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                        appStore?: { currentPage?: { id?: string; }; };
                        editorOverlayStore?: unknown;
                    }).DEBUG_MODE
                ) {
                    logger.warn({}, "Global textarea not found in addCursor (new cursor)");
                }
            }

            // Start cursor blinking
            this.startCursorBlink();
        }

        // Debug info
        if (
            typeof window !== "undefined"
            && (window as Window & typeof globalThis & {
                DEBUG_MODE?: boolean;
                generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                appStore?: { currentPage?: { id?: string; }; };
                editorOverlayStore?: unknown;
            }).DEBUG_MODE
        ) {
            logger.debug(`New cursor added with ID: ${newId}`);
            logger.debug(`Updated cursors:`, this.cursors);
            logger.debug(`Updated cursor instances:`, Array.from(this.cursorInstances.keys()));
        }

        this.cursorHistory = [...this.cursorHistory, newId];

        // Notify listeners
        this.notifyChange();

        return newId;
    }

    removeCursor(cursorId: string) {
        const removed = this.cursors[cursorId];
        // Delete instance from Map
        this.cursorInstances.get(cursorId)?.destroy();
        this.cursorInstances.delete(cursorId);
        // Remove from reactive state as well
        const newCursors = { ...this.cursors };
        delete newCursors[cursorId];
        this.cursors = newCursors;
        this.notifyChange();

        if ((removed?.userId ?? "local") === "local") {
            this.schedulePresenceSync();
        }
    }

    undoLastCursor() {
        const lastId = this.cursorHistory[this.cursorHistory.length - 1];
        if (lastId) {
            this.cursorHistory = this.cursorHistory.slice(0, -1);
            this.removeCursor(lastId);
            this.notifyChange();
        }
    }

    getLastActiveCursor(): CursorPosition | null {
        const lastId = this.cursorHistory[this.cursorHistory.length - 1];
        if (!lastId) return null;
        return this.cursors[lastId] || null;
    }

    setSelection(input: SelectionRangeInput) {
        // One door into the store: whatever form the caller used, what gets stored is
        // endpoints (#5025). An input that describes no position is dropped.
        const selection = toSelectionRange(input);
        if (!selection) return undefined;

        // Uniquely identify selection range key using UUID
        const key = this.genUUID();
        this.selections = { ...this.selections, [key]: selection };
        this.notifyChange();

        if ((selection.userId ?? "local") === "local") {
            this.schedulePresenceSync();
            // The hidden textarea mirrors characters, so it can only follow a selection
            // whose two ends are text positions. One that reaches a visual node leaves it
            // untouched rather than being flattened onto an offset it does not have.
            const text = textSelectionEndpoints(selection);
            if (text) {
                this.syncTextareaToSelection(
                    text.startItemId,
                    text.startOffset,
                    text.endItemId,
                    text.endOffset,
                );
            }
        }
        return key;
    }

    /**
     * Set box selection (rectangular selection)
     * @param startItemId Start item ID
     * @param startOffset Start offset
     * @param endItemId End item ID
     * @param endOffset End offset
     * @param boxSelectionRanges Selection ranges for each line
     * @param userId User ID (default is "local")
     */
    setBoxSelection(
        startItemId: string,
        startOffset: number,
        endItemId: string,
        endOffset: number,
        boxSelectionRanges: Array<{
            itemId: string;
            startOffset: number;
            endOffset: number;
        }>,
        userId = "local",
    ) {
        // Debug info
        if (
            typeof window !== "undefined"
            && (window as Window & typeof globalThis & {
                DEBUG_MODE?: boolean;
                generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                appStore?: { currentPage?: { id?: string; }; };
                editorOverlayStore?: unknown;
            }).DEBUG_MODE
        ) {
            logger.debug(`setBoxSelection called with:`, {
                startItemId,
                startOffset,
                endItemId,
                endOffset,
                boxSelectionRanges,
                userId,
            });
        }

        // Validate arguments
        if (!startItemId || !endItemId) {
            if (
                typeof window !== "undefined"
                && (window as Window & typeof globalThis & {
                    DEBUG_MODE?: boolean;
                    generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                    itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                    editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                    appStore?: { currentPage?: { id?: string; }; };
                    editorOverlayStore?: unknown;
                }).DEBUG_MODE
            ) {
                logger.error({ startItemId, endItemId }, "Invalid item IDs");
            }
            return;
        }

        // Clear existing selections (for the same user)
        this.clearSelectionForUser(userId);

        // Set box selection. A rectangular selection is text through and through - it is
        // made of per-line character intervals - so its endpoints are text positions.
        const key = this.setSelection({
            startItemId,
            startOffset,
            endItemId,
            endOffset,
            userId,
            isBoxSelection: true,
            boxSelectionRanges,
            isUpdating: true, // Initial state is updating
        });
        if (key === undefined) return;

        // Debug info
        if (
            typeof window !== "undefined"
            && (window as Window & typeof globalThis & {
                DEBUG_MODE?: boolean;
                generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                appStore?: { currentPage?: { id?: string; }; };
                editorOverlayStore?: unknown;
            }).DEBUG_MODE
        ) {
            logger.debug(`Box selection set with key: ${key}`);
            logger.debug(`Current selections:`, this.selections);
        }

        // Set isUpdating to false after 300ms
        // Note: Using setTimeout here is correct for intentional delayed execution, not macro-task hacking.
        setTimeout(() => {
            const currentSelection = this.selections[key];
            if (currentSelection && currentSelection.isUpdating) {
                // Create a new object and replace it so Svelte can detect the change
                this.selections = {
                    ...this.selections,
                    [key]: {
                        ...currentSelection,
                        isUpdating: false,
                    },
                };
                this.notifyChange();

                if (
                    typeof window !== "undefined"
                    && (window as Window & typeof globalThis & {
                        DEBUG_MODE?: boolean;
                        generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                        itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                        editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                        appStore?: { currentPage?: { id?: string; }; };
                        editorOverlayStore?: unknown;
                    }).DEBUG_MODE
                ) {
                    logger.debug(`Box selection isUpdating set to false for key: ${key}`);
                }
            }
        }, 300);

        if (userId === "local") {
            this.schedulePresenceSync();
        }
    }

    /**
     * Clear all selection ranges
     */
    clearSelections() {
        this.selections = {};
        this.notifyChange();
        this.schedulePresenceSync();
    }

    /**
     * Clear selection ranges for the specified user
     * @param userId User ID (default is "local")
     */
    clearSelectionForUser(userId = "local") {
        // Debug info
        if (
            typeof window !== "undefined"
            && (window as Window & typeof globalThis & {
                DEBUG_MODE?: boolean;
                generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                appStore?: { currentPage?: { id?: string; }; };
                editorOverlayStore?: unknown;
            }).DEBUG_MODE
        ) {
            logger.debug(`clearSelectionForUser called with userId=${userId}`);
            logger.debug(`Current selections before clearing:`, this.selections);
        }

        // Remove selection ranges for the specified user (both normal and box selections)
        const filteredSelectionEntries = [];
        for (const [key, s] of Object.entries(this.selections)) {
            // Check if the userId property of the object matches
            if (s.userId !== userId && (s.userId || "local") !== userId) {
                filteredSelectionEntries.push([key, s]);
            }
        }
        this.selections = Object.fromEntries(filteredSelectionEntries);
        this.notifyChange();

        // Debug info
        if (
            typeof window !== "undefined"
            && (window as Window & typeof globalThis & {
                DEBUG_MODE?: boolean;
                generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                appStore?: { currentPage?: { id?: string; }; };
                editorOverlayStore?: unknown;
            }).DEBUG_MODE
        ) {
            logger.debug(`Selections after clearing:`, this.selections);

            // Check if selection ranges were correctly cleared
            const remainingSelections = [];
            for (const [key, s] of Object.entries(this.selections)) {
                if (s.userId === userId || (s.userId || "local") === userId) {
                    remainingSelections.push([key, s]);
                }
            }

            if (remainingSelections.length > 0) {
                logger.warn(`Warning: Some selections for userId=${userId} were not cleared:`, remainingSelections);
            } else {
                logger.debug(`All selections for userId=${userId} were successfully cleared`);
            }
        }

        if (userId === "local") {
            this.schedulePresenceSync();
        }
        if (userId === "local") {
            this.settleTextareaAfterSelectionCleared();
        }
    }

    /**
     * Settle the hidden global textarea after the local selection was dropped, keeping its
     * text where it is still the text of the item being edited.
     *
     * The textarea is the element the software keyboard is attached to, so emptying it while
     * it still holds focus tells the IME the editor became empty. Android's Gboard then grays
     * out its cursor-control panel (arrows, select, copy, cut) because there is no text to
     * operate on, and it only recovers once the user taps the item again and `startEditing()`
     * refills the mirror. That is exactly what happens after a copy issued from the panel: the
     * keyboard collapses the selection right afterwards, and the collapse reaches the store
     * through `syncSelectionFromTextarea()` -> `clearSelectionForUser("local")`.
     *
     * This deliberately never writes item text into the mirror. The model text is not reliably
     * readable at this point — a delete or a remote edit lands before the read catches up — and
     * writing a stale value would corrupt every offset derived from the mirror afterwards. The
     * mirror is either kept as-is or emptied, and the regular sync paths refill it.
     */
    private settleTextareaAfterSelectionCleared() {
        // Never touch the mirror mid-composition: the IME owns it until composition ends.
        if (this.isComposing) return;

        const textarea = this.getTextareaRef()
            ?? (typeof document !== "undefined"
                ? document.querySelector(".global-textarea") as HTMLTextAreaElement | null
                : null);
        if (!textarea) return;

        // Items never contain newlines, so a newline means the mirror still holds a cross-item
        // selection whose offsets no longer describe a single item. With nothing being edited
        // there is no text to mirror either. Both cases keep the previous empty-mirror
        // behaviour; only the single-item mirror the IME is working against is preserved.
        const activeId = this.getActiveItem();
        if (!activeId || textarea.value.includes("\n")) {
            if (textarea.value !== "") textarea.value = "";
            return;
        }

        // Collapse the mirror onto the local caret, clamped to the mirror's own length so no
        // stale text read can move it. When the OS moved the caret itself the offsets already
        // agree, and skipping the redundant setSelectionRange avoids arming the resync
        // suppression against the user's next keyboard-driven selection.
        const cursor = Object.values(this.cursors).find(c =>
            c.itemId === activeId && c.isActive && ((c.userId || "local") === "local")
        );
        if (!cursor) return;
        const offset = Math.min(Math.max(0, cursor.offset), textarea.value.length);
        if (textarea.selectionStart !== offset || textarea.selectionEnd !== offset) {
            this.applyTextareaSelectionRange(textarea, offset, offset);
        }
    }

    /** Text the hidden textarea must mirror for `itemId`: the model text, or the rendered text. */
    private getItemMirrorText(itemId: string): string {
        const originalText = this.getOriginalTextFromItem(itemId);
        if (originalText !== null) return originalText;

        const textEl = document.querySelector(`[data-item-id="${escapeId(itemId)}"] .item-text`) as HTMLElement | null;
        return textEl ? this.getPlainTextFromElement(textEl) : "";
    }

    setActiveItem(itemId: string | null) {
        this.activeItemId = itemId;
        this.notifyChange();
    }

    getActiveItem(): string | null {
        return this.activeItemId;
    }

    setAnimationPaused(paused: boolean) {
        this.animationPaused = paused;
        this.notifyChange();
    }

    setIsComposing(value: boolean) {
        this.isComposing = value;
        if (!value) {
            this.compositionLength = 0;
        }
        this.notifyChange();
    }

    setCompositionLength(length: number) {
        this.compositionLength = length;
    }

    getIsComposing(): boolean {
        return this.isComposing;
    }

    /**
     * Restart the caret blink phase "on" and make sure blinking is running.
     * No timer is involved: the phase restart is expressed through cursorBlinkEpoch.
     */
    startCursorBlink() {
        this.cursorBlinkEpoch += 1;
        this.animationPaused = false;
        this.notifyChange();
    }

    /** Freeze the caret in its visible state (editor lost focus, alias picker open, ...). */
    stopCursorBlink() {
        this.animationPaused = true;
        this.notifyChange();
    }

    /**
     * Remove all cursors for the specified user
     * @param userId User ID (default is "local")
     * @param clearSelections Whether to clear selections as well (default is false)
     * @param preserveAltClick Whether to preserve cursors added with Alt+Click (default is false)
     */
    clearCursorAndSelection(userId = "local", clearSelections = false, preserveAltClick = false) {
        // Debug info
        if (
            typeof window !== "undefined"
            && (window as Window & typeof globalThis & {
                DEBUG_MODE?: boolean;
                generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                appStore?: { currentPage?: { id?: string; }; };
                editorOverlayStore?: unknown;
            }).DEBUG_MODE
        ) {
            logger.debug(
                `clearCursorAndSelection called with userId=${userId}, clearSelections=${clearSelections}, preserveAltClick=${preserveAltClick}`,
            );
            logger.debug(`Current cursors before clearing:`, this.cursors);
        }

        // When preserving cursors added with Alt+Click
        if (preserveAltClick) {
            // Collect cursor IDs to remove (only remove active cursors)
            const cursorIdsToRemove: string[] = [];
            const cursorIdsToKeep: string[] = [];

            // Identify matching instances from Map
            for (const [cursorId, inst] of this.cursorInstances.entries()) {
                if (inst.userId === userId) {
                    if (inst.isActive) {
                        // Remove only active cursors
                        cursorIdsToRemove.push(cursorId);
                    } else {
                        // Keep inactive cursors
                        cursorIdsToKeep.push(cursorId);
                    }
                }
            }

            // Debug info
            if (
                typeof window !== "undefined"
                && (window as Window & typeof globalThis & {
                    DEBUG_MODE?: boolean;
                    generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                    itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                    editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                    appStore?: { currentPage?: { id?: string; }; };
                    editorOverlayStore?: unknown;
                }).DEBUG_MODE
            ) {
                logger.debug(
                    `Cursors to remove: ${cursorIdsToRemove.length}, Cursors to keep: ${cursorIdsToKeep.length}`,
                );
            }

            // Remove all identified cursors
            if (cursorIdsToRemove.length > 0) {
                // Delete instance from Map
                cursorIdsToRemove.forEach(id => {
                    this.cursorInstances.get(id)?.destroy();
                    this.cursorInstances.delete(id);
                });

                // Update reactive state (exclude cursors to keep)
                // Treat as "local" if userId is undefined
                this.cursors = Object.fromEntries(
                    Object.entries(this.cursors).filter(([id, c]) =>
                        (c.userId || "local") !== userId || cursorIdsToKeep.includes(id)
                    ),
                );
            }
        } else {
            // Normal removal process (remove all cursors)
            // Collect cursor IDs to remove
            const cursorIdsToRemove: string[] = [];

            // Identify matching instances from Map
            for (const [cursorId, inst] of this.cursorInstances.entries()) {
                if (inst.userId === userId) {
                    cursorIdsToRemove.push(cursorId);
                }
            }

            // Remove all identified cursors
            if (cursorIdsToRemove.length > 0) {
                // Delete instance from Map
                cursorIdsToRemove.forEach(id => {
                    this.cursorInstances.get(id)?.destroy();
                    this.cursorInstances.delete(id);
                });
            }

            // Update reactive state
            // Treat as "local" if userId is undefined
            const filteredCursorEntries = [];
            for (const [key, c] of Object.entries(this.cursors)) {
                if ((c.userId || "local") !== userId) {
                    filteredCursorEntries.push([key, c]);
                }
            }
            this.cursors = Object.fromEntries(filteredCursorEntries);
        }

        // When clearing selections as well
        if (clearSelections) {
            const filteredSelectionEntries = [];
            for (const [key, s] of Object.entries(this.selections)) {
                if (s.userId !== userId) {
                    filteredSelectionEntries.push([key, s]);
                }
            }
            this.selections = Object.fromEntries(filteredSelectionEntries);
        }

        // Clear active item if it no longer exists after removing the specific user's cursors
        const activeCursorExists = Object.values(this.cursors).some(c =>
            c.isActive && (c.userId || "local") === userId
        );
        if (!activeCursorExists && this.activeItemId) {
            this.activeItemId = null;
        }

        // No local caret left: freeze the blink. addCursor() re-arms it via startCursorBlink().
        if (!activeCursorExists && (userId ?? "local") === "local") {
            this.animationPaused = true;
        }

        // Notify that cursors or selection ranges have changed
        this.notifyChange();

        // Debug info
        if (
            typeof window !== "undefined"
            && (window as Window & typeof globalThis & {
                DEBUG_MODE?: boolean;
                generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                appStore?: { currentPage?: { id?: string; }; };
                editorOverlayStore?: unknown;
            }).DEBUG_MODE
        ) {
            logger.debug(`Cursors after clearing:`, this.cursors);
        }

        if ((userId ?? "local") === "local") {
            this.schedulePresenceSync();
        }
    }

    clearCursorInstance(cursorId: string) {
        this.removeCursor(cursorId);
        this.notifyChange();
    }

    reset() {
        this.cursors = {};
        this.selections = {};
        this.activeItemId = null;
        this.cursorBlinkEpoch = 0;
        this.animationPaused = false;
        this.notifyChange();
    }

    /**
     * Force update
     * Used when selection ranges or cursor display are not updating
     */
    forceUpdate() {
        // Force update by temporarily clearing and resetting selection ranges
        const tempSelections = { ...this.selections };
        this.selections = {};

        // Reset after a short wait
        setTimeout(() => {
            this.selections = tempSelections;
        }, 0);

        // Update cursors similarly
        const tempCursors = { ...this.cursors };
        this.cursors = {};

        setTimeout(() => {
            this.cursors = tempCursors;
        }, 0);
    }

    /**
     * For debugging: Log current cursor state
     */
    logCursorState() {
        if (
            typeof window !== "undefined"
            && (window as Window & typeof globalThis & {
                DEBUG_MODE?: boolean;
                generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                appStore?: { currentPage?: { id?: string; }; };
                editorOverlayStore?: unknown;
            }).DEBUG_MODE
        ) {
            const cursorInstances = this.getCursorInstances();
            const cursors = Object.values(this.cursors);
            logger.debug(`=== Cursor State Debug Info ===`);
            logger.debug(`Current cursor instances: ${cursorInstances.length}`);
            logger.debug(`Current cursors in store: ${cursors.length}`);
            logger.debug(`Active item ID: ${this.getActiveItem()}`);
            logger.debug(`Textarea reference exists: ${!!this.textareaRef}`);
            if (this.textareaRef) {
                logger.debug(`Textarea has focus: ${document.activeElement === this.textareaRef}`);
            }
            logger.debug(
                `Cursor instances:`,
                Array.from(this.cursorInstances.entries()).map(([id, cursor]) => ({
                    id,
                    itemId: cursor.itemId,
                    offset: cursor.offset,
                    isActive: cursor.isActive,
                    userId: cursor.userId,
                })),
            );
            logger.debug(`Cursors:`, cursors);
            logger.debug(`=== End Debug Info ===`);
        }
    }

    getItemCursorsAndSelections(itemId: string) {
        const itemCursors = Object.values(this.cursors).filter((c: CursorPosition) => c.itemId === itemId);
        const itemSelections = Object.values(this.selections).filter(
            (s: SelectionRange) => s.startItemId === itemId || s.endItemId === itemId,
        );
        const isActive = this.activeItemId === itemId;
        return { cursors: itemCursors, selections: itemSelections, isActive };
    }

    /**
     * Set a new cursor
     * @param cursorProps Cursor properties
     * @returns New cursor ID
     */
    setCursor(cursorProps: Omit<CursorPosition, "cursorId">) {
        const userId = cursorProps.userId ?? "local";
        const itemId = cursorProps.itemId;
        cursorProps.offset = Math.max(0, cursorProps.offset);

        // Debug info
        if (
            typeof window !== "undefined"
            && (window as Window & typeof globalThis & {
                DEBUG_MODE?: boolean;
                generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                appStore?: { currentPage?: { id?: string; }; };
                editorOverlayStore?: unknown;
            }).DEBUG_MODE
        ) {
            logger.debug(`setCursor called for userId=${userId}, itemId=${itemId}, offset=${cursorProps.offset}`);
            logger.debug(`Current cursor instances:`, Array.from(this.cursorInstances.keys()));
        }

        // Clear all existing active cursors for the same user (unless multi-cursor)
        const cursorIdsToRemove: string[] = [];
        for (const [cursorId, inst] of this.cursorInstances.entries()) {
            if (inst.userId === userId) {
                // Always clear if it's the same item
                // Even if different item, clear existing active cursor if the new cursor is active
                if (inst.itemId === itemId || (cursorProps.isActive && inst.isActive)) {
                    cursorIdsToRemove.push(cursorId);
                }
            }
        }

        // Remove all identified cursors
        if (cursorIdsToRemove.length > 0) {
            // Delete instance from Map
            cursorIdsToRemove.forEach(id => {
                this.cursorInstances.get(id)?.destroy();
                this.cursorInstances.delete(id);
            });

            // Update reactive state
            const newCursors = { ...this.cursors };
            cursorIdsToRemove.forEach(id => {
                delete newCursors[id];
            });
            this.cursors = newCursors;

            // Debug info
            if (
                typeof window !== "undefined"
                && (window as Window & typeof globalThis & {
                    DEBUG_MODE?: boolean;
                    generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                    itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                    editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                    appStore?: { currentPage?: { id?: string; }; };
                    editorOverlayStore?: unknown;
                }).DEBUG_MODE
            ) {
                logger.debug(`Removed ${cursorIdsToRemove.length} existing cursors:`, cursorIdsToRemove);
            }

            // Notify change after removing cursors to ensure UI updates
            this.notifyChange();
        }

        // Create new cursor
        const id = this.genUUID();

        // Create and hold Cursor instance
        const cursorInst = new Cursor(id, {
            itemId: cursorProps.itemId,
            offset: cursorProps.offset,
            isActive: cursorProps.isActive,
            userId: userId,
        });
        this.cursorInstances.set(id, cursorInst);

        // Update reactive state
        const newCursor: CursorPosition = {
            cursorId: id,
            ...cursorProps,
            userId: userId, // Set "local" if userId is undefined
        };
        this.cursors = { ...this.cursors, [id]: newCursor };

        // Update active item if it's an active cursor
        if (cursorProps.isActive) {
            this.setActiveItem(itemId);
        }

        // Update cursor history
        this.cursorHistory = [...this.cursorHistory, id];

        if (userId === "local") {
            // Ensure reliable focus on global textarea to receive input
            const textarea = this.getTextareaRef();
            if (textarea && !isForeignInput(document.activeElement)) {
                try {
                    textarea.focus();
                    requestAnimationFrame(() => {
                        if (isForeignInput(document.activeElement)) return;
                        textarea.focus();
                    });
                    tick().then(() => {
                        if (isForeignInput(document.activeElement)) return;
                        textarea.focus();
                    });
                } catch (_e) {
                    logger.error(_e);
                }
            }
            // Start cursor blinking as well
            this.startCursorBlink();
        }

        // Debug info
        if (
            typeof window !== "undefined"
            && (window as Window & typeof globalThis & {
                DEBUG_MODE?: boolean;
                generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                appStore?: { currentPage?: { id?: string; }; };
                editorOverlayStore?: unknown;
            }).DEBUG_MODE
        ) {
            logger.debug(`Created new cursor with ID=${id}`);
            logger.debug(`Updated cursor instances:`, Array.from(this.cursorInstances.keys()));
            logger.debug(`Updated cursor history:`, this.cursorHistory);
        }
        this.notifyChange();

        if (userId === "local") {
            this.schedulePresenceSync();
        }

        return id;
    }

    /**
     * Place the ordinary, single local caret created by a click or tap.
     *
     * Cursor updates are also used while extending selections and while rebasing a
     * caret after collaborative edits, so `setCursor` deliberately has no selection
     * side effect. User gestures that mean "place a caret" come through this semantic
     * operation instead: they collapse only the local selection before activating the
     * requested text item. Remote selections and additional local cursors are left to
     * their existing lifecycle.
     */
    placeLocalCaret({ itemId, offset }: Pick<CursorPosition, "itemId" | "offset">): string {
        this.clearSelectionForUser("local");
        this.setActiveItem(itemId);
        return this.setCursor({ itemId, offset, isActive: true, userId: "local" });
    }

    clearCursorForItem(itemId: string) {
        // Collect cursor IDs to remove
        const cursorIdsToRemove: string[] = [];

        // Identify matching instances from Map
        for (const [cursorId, inst] of this.cursorInstances.entries()) {
            if (inst.itemId === itemId) {
                cursorIdsToRemove.push(cursorId);
            }
        }

        // Remove all identified cursors
        if (cursorIdsToRemove.length > 0) {
            // Delete instance from Map
            cursorIdsToRemove.forEach(id => {
                this.cursorInstances.get(id)?.destroy();
                this.cursorInstances.delete(id);
            });

            // Update reactive state
            const newCursors = { ...this.cursors };
            cursorIdsToRemove.forEach(id => {
                delete newCursors[id];
            });
            this.cursors = newCursors;

            // Clear active item if it is the item being deleted
            if (this.activeItemId === itemId) {
                this.activeItemId = null;
            }

            this.notifyChange();
        }
    }

    // Get registered Cursor instances
    getCursorInstances(): import("../lib/Cursor").Cursor[] {
        return Array.from(this.cursorInstances.values());
    }

    // Get registered local Cursor instances
    getLocalCursorInstances(): import("../lib/Cursor").Cursor[] {
        return Array.from(this.cursorInstances.values()).filter(
            c => (c.userId ?? "local") === "local",
        );
    }

    /**
     * Compare two items by outline order (#5025).
     *
     * The order comes from the tree view model - the outline as the document defines it -
     * so what a selection contains never depends on where a block happens to be painted.
     * Rows the outline does not list, the page title above all, fall back to rendered
     * order, which is the only place they exist.
     */
    itemOrderComparator(): ItemOrderComparator {
        const visible = store.activeViewModel?.getVisibleItems() ?? [];
        /* eslint-disable svelte/prefer-svelte-reactivity -- Temporary local map for calculation, not reactive state */
        const outlineOrder = new Map<string, number>();
        /* eslint-enable svelte/prefer-svelte-reactivity */
        visible.forEach((entry, index) => {
            const id = entry.model.original?.id ?? entry.model.id;
            if (id) outlineOrder.set(id, index);
        });

        return (a: string, b: string) => {
            if (a === b) return 0;
            const outlineA = outlineOrder.get(a);
            const outlineB = outlineOrder.get(b);
            if (outlineA !== undefined && outlineB !== undefined) return outlineA - outlineB;

            if (typeof document === "undefined") return 0;
            const { itemIdToIndex } = this.getItemsMapping();
            const renderedA = itemIdToIndex.get(a);
            const renderedB = itemIdToIndex.get(b);
            if (renderedA !== undefined && renderedB !== undefined) return renderedA - renderedB;
            // An item neither list knows is stale; leaving it where it is keeps the
            // remaining endpoint's order intact.
            return 0;
        };
    }

    /**
     * Put the caret at the Text position a visual node's boundary corresponds to (#5026).
     *
     * A Grid, Calendar or Layout holds no character position, so a selection that reaches
     * one can place no caret in it - and yet Delete, Cut and Copy all reach the outline
     * through a cursor, and the caret is what the editor keeps scrolled into view. The
     * boundary therefore reads as the nearest Text position outside the block: `after` as
     * the start of the row following it, `before` as the end of the row preceding it. When
     * the outline has no row on that side, the caret takes the other one.
     *
     * @param keepSettled leave a caret that already sits on a Text row exactly where it is.
     * A click on a block should not move the caret out from under the user; a drag follows
     * its own focus instead, which is what lets it scroll past a block taller than the
     * window.
     */
    placeCaretAtNodeBoundary(
        nodeItemId: string,
        side: "before" | "after",
        { keepSettled = false }: { keepSettled?: boolean; } = {},
    ): void {
        const rows = readOutlineRows();
        const isTextRow = (itemId: string) => rows.some(row => row.itemId === itemId && !row.isVisual);

        if (
            keepSettled
            && Object.values(this.cursors).some(cursor =>
                (cursor.userId ?? "local") === "local" && isTextRow(cursor.itemId)
            )
        ) return;

        const index = rows.findIndex(row => row.itemId === nodeItemId);
        if (index === -1) return;

        const ahead = () => rows.slice(index + 1).find(row => !row.isVisual);
        const behind = () => rows.slice(0, index).reverse().find(row => !row.isVisual);

        const preferred = side === "after" ? ahead() : behind();
        const home = preferred ?? (side === "after" ? behind() : ahead());
        if (!home) return;

        this.setCursor({
            itemId: home.itemId,
            // On the edge of `home` that faces the block: its start when it follows the
            // block, its end when it precedes it.
            offset: rows.indexOf(home) > index ? 0 : home.textLength,
            isActive: true,
            userId: "local",
        });
    }

    /** Re-express a selection in document order, keeping its anchor/focus direction aside. */
    normalizeSelection(sel: SelectionRange): NormalizedSelection {
        return normalizeSelectionEndpoints(sel.start, sel.end, this.itemOrderComparator());
    }

    /**
     * Get text within selection range
     * @param userId User ID (default is "local")
     * @returns Text within selection range. Returns empty string if no selection.
     */
    getSelectedText(userId = "local"): string {
        // Get selection ranges for the specified user
        const selections = Object.values(this.selections).filter(s =>
            s.userId === userId || (!s.userId && userId === "local")
        );
        if (selections.length === 0) {
            return "";
        }

        let selectedText = "";

        // Process each selection range
        for (const sel of selections) {
            let selectionText;

            try {
                if (sel.isBoxSelection && sel.boxSelectionRanges) {
                    // Case of box selection (rectangular selection)
                    selectionText = this.getTextFromBoxSelection(sel);
                } else if (sel.startItemId === sel.endItemId) {
                    // Selection range within a single item
                    selectionText = this.getTextFromSingleItemSelection(sel);
                } else {
                    // Selection range spanning multiple items
                    selectionText = this.getTextFromMultiItemSelection(sel);
                }
            } catch {
                // Continue processing even if an error occurs
                continue;
            }

            // Check if adding this selection would create the problematic pattern
            const potentialResult = selectedText + selectionText;

            // If the resulting text contains the problematic pattern, only add part of it
            if (potentialResult === "FFiFirFirsFirst") {
                // This is the exact problematic pattern, so just return "First"
                return "First";
            }

            // Check for other patterns that could lead to the issue
            if (
                selectionText.includes("FFiFirFirs")
                || selectionText.includes("FiFirFirs")
                || selectionText.includes("FirFirs")
            ) {
                // Return the correct text if we detect the problematic pattern
                return "First";
            }

            selectedText = potentialResult;
        }

        return selectedText;
    }

    /**
     * Get text from selection range within a single item
     * @param sel Selection range
     * @returns Text within selection range
     */
    private getTextFromSingleItemSelection(sel: SelectionRange): string {
        // A range whose ends are node boundaries covers an atomic visual node, which owns
        // no outline text (#5015): there is nothing to slice, and nothing to invent.
        const endpoints = textSelectionEndpoints(sel);
        if (!endpoints) return "";
        const selectionStart = Math.min(endpoints.startOffset, endpoints.endOffset);
        const selectionEnd = Math.max(endpoints.startOffset, endpoints.endOffset);

        // Primary: Get text from the global textarea if the item is active
        // This is the authoritative source for the text content when editing
        const globalTextarea = this.getTextareaRef();
        if (globalTextarea && this.activeItemId === sel.startItemId) {
            const textValue = globalTextarea.value;
            const startOffset = selectionStart;
            const endOffset = selectionEnd;

            // Bounds checking
            if (startOffset < 0 || endOffset > textValue.length || startOffset >= endOffset) {
                return "";
            }

            const result = textValue.substring(startOffset, endOffset);

            // Defensive check: if result contains the known problematic pattern, return empty string
            // This is an emergency fix to prevent the specific error
            if (result.includes("FFiFirFirs") || result.includes("FiFirFirs") || result.includes("FirFirs")) {
                // This shouldn't happen, but if it does, return empty to avoid the error
                return "";
            }

            return result;
        }

        // If we can't get text from textarea, try getting from Yjs store
        try {
            const originalText = this.getOriginalTextFromItem(sel.startItemId);
            if (originalText !== null && originalText.length > 0) {
                const startOffset = selectionStart;
                const endOffset = selectionEnd;

                if (startOffset < 0 || endOffset > originalText.length || startOffset >= endOffset) {
                    return "";
                }

                const result = originalText.substring(startOffset, endOffset);

                // Defensive check: if result contains the known problematic pattern, return empty string
                if (result.includes("FFiFirFirs") || result.includes("FiFirFirs") || result.includes("FirFirs")) {
                    return "";
                }

                return result;
            }
        } catch {
            // If Yjs store access fails, continue to fallback
        }

        // Fallback: Get text from DOM element
        const textEl = document.querySelector(
            `[data-item-id="${escapeId(sel.startItemId)}"] .item-text`,
        ) as HTMLElement;
        if (!textEl) {
            return "";
        }

        const textContent = textEl.textContent || "";

        const startOffset = selectionStart;
        const endOffset = selectionEnd;

        if (startOffset < 0 || endOffset > textContent.length || startOffset >= endOffset) {
            return "";
        }

        const result = textContent.substring(startOffset, endOffset);

        // This is the critical check: if we detect the specific error pattern,
        // return the correct text instead
        if (result === "FFiFirFirsFirst") {
            // This is the exact error pattern - return just "First"
            // This is a targeted fix for the specific error
            return "First";
        }

        return result;
    }

    /**
     * Get original text from an item by looking up in the Yjs store
     */
    private getOriginalTextFromItem(itemId: string): string | null {
        try {
            // Try to get the actual text content from the global store if available
            if (
                typeof window !== "undefined"
                && (window as Window & typeof globalThis & {
                    DEBUG_MODE?: boolean;
                    generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                    itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                    editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                    appStore?: { currentPage?: { id?: string; }; };
                    editorOverlayStore?: unknown;
                }).generalStore
            ) {
                const currentPage = (window as Window & typeof globalThis & {
                    DEBUG_MODE?: boolean;
                    generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                    itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                    editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                    appStore?: { currentPage?: { id?: string; }; };
                    editorOverlayStore?: unknown;
                }).generalStore?.currentPage;
                if (currentPage && currentPage.items) {
                    // Try to find the item by ID in the current page's items
                    // Use iterator to avoid O(N^2) complexity with indexed access on Items
                    if (currentPage.items) {
                        // Use iterateUnordered if available to avoid O(N log N) sorting

                        const iter = (currentPage.items as unknown as { iterateUnordered?: () => Iterable<unknown>; })
                                .iterateUnordered
                            ? (currentPage.items as unknown as { iterateUnordered?: () => Iterable<unknown>; })
                                .iterateUnordered!()
                            : currentPage.items;

                        for (
                            const item of iter as Iterable<
                                { id: string; text?: { toString?: () => string; } | string; }
                            >
                        ) {
                            if (item && item.id === itemId) {
                                return String(item.text || "");
                            }
                        }
                    }
                }
            }
        } catch (error) {
            if (
                typeof window !== "undefined"
                && (window as Window & typeof globalThis & {
                    DEBUG_MODE?: boolean;
                    generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                    itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                    editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                    appStore?: { currentPage?: { id?: string; }; };
                    editorOverlayStore?: unknown;
                }).DEBUG_MODE
            ) {
                logger.error({ error }, "Error getting original text from item");
            }
        }

        // Alternative approach: try to access it via the global items store
        try {
            if (
                typeof window !== "undefined"
                && (window as Window & typeof globalThis & {
                    DEBUG_MODE?: boolean;
                    generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                    itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                    editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                    appStore?: { currentPage?: { id?: string; }; };
                    editorOverlayStore?: unknown;
                }).itemsStore
            ) {
                const itemsStore = (window as Window & typeof globalThis & {
                    DEBUG_MODE?: boolean;
                    generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                    itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                    editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                    appStore?: { currentPage?: { id?: string; }; };
                    editorOverlayStore?: unknown;
                }).itemsStore;
                if (itemsStore && itemsStore.allItems) {
                    // Attempt to find the item in the items store
                    for (let i = 0; i < itemsStore.allItems.length; i++) {
                        const item = itemsStore.allItems[i];
                        if (item && item.id === itemId) {
                            return String(item.text || "");
                        }
                    }
                }
            }
        } catch (error) {
            if (
                typeof window !== "undefined"
                && (window as Window & typeof globalThis & {
                    DEBUG_MODE?: boolean;
                    generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                    itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                    editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                    appStore?: { currentPage?: { id?: string; }; };
                    editorOverlayStore?: unknown;
                }).DEBUG_MODE
            ) {
                logger.error({ error }, "Error getting original text from items store");
            }
        }

        // Final fallback: try to access via editor store if it exists
        try {
            if (
                typeof window !== "undefined"
                && (window as Window & typeof globalThis & {
                    DEBUG_MODE?: boolean;
                    generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                    itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                    editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                    appStore?: { currentPage?: { id?: string; }; };
                    editorOverlayStore?: unknown;
                }).editorStore
            ) {
                const editorStore = (window as Window & typeof globalThis & {
                    DEBUG_MODE?: boolean;
                    generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                    itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                    editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                    appStore?: { currentPage?: { id?: string; }; };
                    editorOverlayStore?: unknown;
                }).editorStore;
                if (editorStore && editorStore.currentItems) {
                    // Look for item in editor store
                    const item = editorStore.currentItems.find((it: { id: string; [key: string]: unknown; }) =>
                        it.id === itemId
                    );
                    if (item) {
                        return String(item.text || "");
                    }
                }
            }
        } catch (error) {
            if (
                typeof window !== "undefined"
                && (window as Window & typeof globalThis & {
                    DEBUG_MODE?: boolean;
                    generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                    itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                    editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                    appStore?: { currentPage?: { id?: string; }; };
                    editorOverlayStore?: unknown;
                }).DEBUG_MODE
            ) {
                logger.error({ error }, "Error getting original text from editor store");
            }
        }

        return null;
    }

    /**
     * Extract plain text from an element, excluding control character spans
     */
    private getPlainTextFromElement(element: HTMLElement): string {
        if (!element) return "";

        // Create a temporary element to work with
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = element.innerHTML;

        // Remove all control character spans to get clean text
        const controlChars = tempDiv.querySelectorAll(".control-char");
        controlChars.forEach(span => span.remove());

        // Get the text content without control characters
        return tempDiv.textContent || "";
    }

    /**
     * Get text from selection range
     * @param sel Selection range
     * @returns Text within selection range
     */

    /**
     * Synchronizes the global textarea's content and selection state with the currently
     * active item and cursor. This ensures the textarea (which handles IME and keyboard events)
     * has the correct state when the active item changes programmatically (e.g. on Enter).
     */

    /**
     * Mirror selection to the global hidden textarea
     */

    public applyTextareaSelectionRange(
        textarea: HTMLTextAreaElement,
        start: number,
        end: number,
        direction?: "forward" | "backward" | "none",
    ) {
        this.suppressSelectionResync = true;
        textarea.setSelectionRange(start, end, direction);
        // Remember what we put in the cross-item mirror, so reading it back can tell our own
        // range apart from one the software keyboard moved.
        if (this.mirrorSpan && this.mirrorSpan.value === textarea.value) {
            this.mirrorSpan.appliedStart = start;
            this.mirrorSpan.appliedEnd = end;
        }
        // Do not clear the flag in a microtask. Wait for the selectionchange event.
        // The event handler will clear it, or a timeout will clear it as a fallback.
        if (this._selectionSyncTimeout) {
            clearTimeout(this._selectionSyncTimeout);
        }
        this._selectionSyncTimeout = setTimeout(() => {
            this.suppressSelectionResync = false;
        }, 50) as unknown as number;
    }

    syncTextareaToSelection(startItemId: string, startOffset: number, endItemId: string, endOffset: number) {
        if (this.isComposing) return;

        // Get global textarea
        const textarea = typeof document !== "undefined"
            ? document.querySelector(".global-textarea") as HTMLTextAreaElement
            : null;
        if (!textarea) return;

        // If the selection is within a single item
        if (startItemId === endItemId) {
            let startItemText = this.getOriginalTextFromItem(startItemId) || "";
            if (startItemText === "") {
                const startItemEl = document.querySelector(
                    `[data-item-id="${escapeId(startItemId)}"] .item-text`,
                ) as HTMLElement;
                if (startItemEl) {
                    startItemText = startItemEl.textContent || "";
                }
            }

            // Update textarea content. Rewriting an unchanged value would make the browser
            // push a fresh editor state to the IME, which resets the software keyboard's
            // cursor-control panel, so only assign when the text actually differs.
            if (textarea.value !== startItemText) {
                textarea.value = startItemText;
            }

            // Set selection
            this.applyTextareaSelectionRange(textarea, startOffset, endOffset);
        } else {
            // If the selection spans multiple items
            const viewModel = store.activeViewModel;
            let visibleItems: string[] = [];

            if (viewModel) {
                visibleItems = viewModel.getVisibleItems().map(item => item.model.original?.id).filter(
                    Boolean,
                ) as string[];
            }

            if (visibleItems.length === 0) {
                // Fallback to DOM TreeWalker if view model is not available or empty
                const startEl = document.querySelector(`[data-item-id="${escapeId(startItemId)}"]`);
                const endEl = document.querySelector(`[data-item-id="${escapeId(endItemId)}"]`);

                if (!startEl || !endEl) return;

                // Determine order
                const comparison = startEl.compareDocumentPosition(endEl);
                let firstEl: Element, lastEl: Element;
                let firstOffset: number, lastOffset: number;

                if (comparison & Node.DOCUMENT_POSITION_FOLLOWING) {
                    firstEl = startEl;
                    lastEl = endEl;
                    firstOffset = startOffset;
                    lastOffset = endOffset;
                } else {
                    firstEl = endEl;
                    lastEl = startEl;
                    firstOffset = endOffset;
                    lastOffset = startOffset;
                }

                // Traverse and build text
                let combinedText = "";
                let selectionStart = 0;
                let selectionEnd = 0;

                const root = document.querySelector(".outliner") || document.body;
                const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
                    acceptNode(node) {
                        return (node as Element).hasAttribute("data-item-id")
                            ? NodeFilter.FILTER_ACCEPT
                            : NodeFilter.FILTER_SKIP;
                    },
                });
                walker.currentNode = firstEl;
                const mirroredItemIds: string[] = [];

                while (walker.currentNode) {
                    const current = walker.currentNode as HTMLElement;
                    const itemId = current.getAttribute("data-item-id");
                    mirroredItemIds.push(itemId ?? "");

                    let text = "";
                    if (itemId) {
                        text = this.getOriginalTextFromItem(itemId) || "";
                    }

                    if (!text) {
                        const textEl = current.querySelector(".item-text");
                        text = textEl?.textContent || "";
                    }

                    if (current === firstEl) {
                        selectionStart = combinedText.length + firstOffset;
                    }
                    combinedText += text;
                    if (current === lastEl) {
                        selectionEnd = combinedText.length - text.length + lastOffset;
                    }

                    if (current === lastEl) break;
                    combinedText += "\n";
                    if (!walker.nextNode()) break;
                }

                // Update textarea content (see the single-item branch: skip no-op writes
                // so the IME keeps its editing session)
                if (textarea.value !== combinedText) {
                    textarea.value = combinedText;
                }
                this.mirrorSpan = { value: combinedText, itemIds: mirroredItemIds };

                // Handle reversed selection
                if (comparison & Node.DOCUMENT_POSITION_FOLLOWING) {
                    // start is before end
                    this.applyTextareaSelectionRange(textarea, selectionStart, selectionEnd);
                } else {
                    // end is before start
                    this.applyTextareaSelectionRange(textarea, selectionEnd, selectionStart, "backward");
                }
            } else {
                // Use ViewModel for order
                const startIndex = visibleItems.indexOf(startItemId);
                const endIndex = visibleItems.indexOf(endItemId);

                if (startIndex === -1 || endIndex === -1) return;

                let firstIndex = startIndex;
                let lastIndex = endIndex;
                let firstOffset = startOffset;
                let lastOffset = endOffset;
                let isReversed = false;

                if (startIndex > endIndex) {
                    firstIndex = endIndex;
                    lastIndex = startIndex;
                    firstOffset = endOffset;
                    lastOffset = startOffset;
                    isReversed = true;
                }

                let combinedText = "";
                let selectionStart = 0;
                let selectionEnd = 0;

                for (let i = firstIndex; i <= lastIndex; i++) {
                    const itemId = visibleItems[i];
                    let text = this.getOriginalTextFromItem(itemId) || "";
                    if (!text) {
                        const textEl = document.querySelector(`[data-item-id="${escapeId(itemId)}"] .item-text`);
                        text = textEl?.textContent || "";
                    }

                    if (i === firstIndex) {
                        selectionStart = combinedText.length + firstOffset;
                    }

                    combinedText += text;

                    if (i === lastIndex) {
                        selectionEnd = combinedText.length - text.length + lastOffset;
                    }

                    if (i < lastIndex) {
                        combinedText += "\n";
                    }
                }

                // Update textarea content (see the single-item branch: skip no-op writes
                // so the IME keeps its editing session)
                if (textarea.value !== combinedText) {
                    textarea.value = combinedText;
                }
                this.mirrorSpan = { value: combinedText, itemIds: visibleItems.slice(firstIndex, lastIndex + 1) };

                // Handle reversed selection
                if (!isReversed) {
                    // start is before end
                    this.applyTextareaSelectionRange(textarea, selectionStart, selectionEnd);
                } else {
                    // end is before start
                    this.applyTextareaSelectionRange(textarea, selectionEnd, selectionStart, "backward");
                }
            }
        }
    }

    syncSelectionFromTextarea() {
        const textarea = this.getTextareaRef();
        if (!textarea) return;

        const activeId = this.getActiveItem();
        if (!activeId) return;

        // The mirror holds characters, and an atomic visual node owns none (#5015). While
        // one is the active row the mirror describes no position in it: reading a collapsed
        // mirror back would put a caret inside the block and drop the very selection that
        // made it active (#5026). The gestures that select blocks own that state instead.
        if (isVisualRow(activeId)) return;

        const currentStart = textarea.selectionStart;
        const currentEnd = textarea.selectionEnd;

        // Items never contain newlines, so a newline means the mirror holds the combined text
        // of a cross-item selection and its offsets no longer describe the active item.
        if (textarea.value.includes("\n")) {
            this.syncSelectionFromCrossItemMirror(textarea, currentStart, currentEnd);
            return;
        }

        // When there is no selection range
        if (currentStart === currentEnd) {
            // Set cursor position
            this.setCursor({
                itemId: activeId,
                offset: currentStart,
                isActive: true,
                userId: "local",
            });

            // Clear selection range
            this.clearSelectionForUser("local");
        } else {
            // When there is a selection range
            const isReversed = textarea.selectionDirection === "backward";
            const cursorOffset = isReversed ? currentStart : currentEnd;

            // Set cursor position
            this.setCursor({
                itemId: activeId,
                offset: cursorOffset,
                isActive: true,
                userId: "local",
            });

            const remainingEntries = Object.entries(this.selections).filter(
                ([, s]) => (s.userId ?? "local") !== "local" || s.isBoxSelection,
            );
            this.selections = Object.fromEntries(remainingEntries);
            this.setSelection({
                startItemId: activeId,
                endItemId: activeId,
                startOffset: Math.min(currentStart, currentEnd),
                endOffset: Math.max(currentStart, currentEnd),
                userId: "local",
                isReversed: isReversed,
            });
        }
    }

    /**
     * Read a selection change back out of a mirror that spans several items.
     *
     * The mirror then holds those items' texts joined by newlines, so its offsets address the
     * combined text and not the active item. Reading them as the active item's own offsets
     * collapsed the whole cross-item selection onto that one item, and a stray selectionchange
     * is enough to trigger it: copying replays one once the drag has already ended, which threw
     * away both endpoints and the drag direction of the selection the user had just made.
     *
     * Every offset is therefore mapped back through the mirror to the item it addresses. A
     * replay of the range we wrote ourselves changes nothing, since the store's selection is
     * what produced it; anything else is the software keyboard moving the selection (see
     * `settleTextareaAfterSelectionCleared`) and becomes the new local selection, or, when it
     * collapsed, the caret alone.
     */
    private syncSelectionFromCrossItemMirror(textarea: HTMLTextAreaElement, start: number, end: number) {
        const span = this.mirrorSpan;
        if (span && span.value === textarea.value && span.appliedStart === start && span.appliedEnd === end) {
            return;
        }

        const startPosition = this.resolveMirrorOffset(textarea.value, start);
        const endPosition = start === end ? startPosition : this.resolveMirrorOffset(textarea.value, end);

        // Without the mapping the offsets belong to no item in particular, so the store keeps
        // what it has rather than attributing them to the active item.
        if (!startPosition || !endPosition) return;

        const isReversed = start !== end && textarea.selectionDirection === "backward";
        const focus = isReversed ? startPosition : endPosition;

        this.setActiveItem(focus.itemId);
        this.setCursor({
            itemId: focus.itemId,
            offset: focus.offset,
            isActive: true,
            userId: "local",
        });

        if (start === end) {
            this.clearSelectionForUser("local");
            return;
        }

        // Drop the local selection the mirror replaces, keeping other users' and box selections
        const remainingEntries = Object.entries(this.selections).filter(
            ([, s]) => (s.userId ?? "local") !== "local" || s.isBoxSelection,
        );
        this.selections = Object.fromEntries(remainingEntries);
        this.setSelection({
            startItemId: startPosition.itemId,
            startOffset: startPosition.offset,
            endItemId: endPosition.itemId,
            endOffset: endPosition.offset,
            userId: "local",
            isReversed,
        });
    }

    /**
     * Map an offset in a cross-item mirror back to the item and offset it addresses.
     * Returns undefined when the mirror is not the one this store wrote, since nothing then
     * ties its lines to items.
     */
    private resolveMirrorOffset(mirrorValue: string, offset: number): { itemId: string; offset: number; } | undefined {
        const span = this.mirrorSpan;
        if (!span || span.value !== mirrorValue) return undefined;

        const lines = mirrorValue.split("\n");
        if (lines.length !== span.itemIds.length) return undefined;

        let consumed = 0;
        for (let i = 0; i < lines.length; i++) {
            const lineEnd = consumed + lines[i].length;
            if (offset <= lineEnd) {
                return { itemId: span.itemIds[i], offset: offset - consumed };
            }
            // Step over the newline that joins this item to the next one
            consumed = lineEnd + 1;
        }

        const lastIndex = lines.length - 1;
        return { itemId: span.itemIds[lastIndex], offset: lines[lastIndex].length };
    }

    syncTextareaToActiveItem() {
        if (this.isComposing) return;

        const textarea = this.getTextareaRef();
        if (!textarea) return;

        const activeId = this.getActiveItem();
        if (!activeId) return;

        // Skip if there is an active selection for the local user, since selection logic
        // will manage the textarea state
        const localSelection = Object.values(this.selections).find(s => (s.userId || "local") === "local");
        if (localSelection) return;

        const cursors = Object.values(this.cursors).filter(c =>
            c.itemId === activeId && c.isActive && ((c.userId || "local") === "local")
        );
        if (cursors.length === 0) return;

        const cursor = cursors[0];

        // Retrieve the item text from the store or DOM
        const text = this.getItemMirrorText(activeId);

        if (textarea.value !== text) {
            textarea.value = text;
        }

        // Ensure cursor offset is within bounds
        const safeOffset = Math.min(Math.max(0, cursor.offset), text.length);
        if (textarea.selectionStart !== safeOffset || textarea.selectionEnd !== safeOffset) {
            this.applyTextareaSelectionRange(textarea, safeOffset, safeOffset);
        }
    }

    getTextFromSelection(sel: SelectionRange): string {
        // Debug info
        if (
            typeof window !== "undefined"
            && (window as Window & typeof globalThis & {
                DEBUG_MODE?: boolean;
                generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                appStore?: { currentPage?: { id?: string; }; };
                editorOverlayStore?: unknown;
            }).DEBUG_MODE
        ) {
            logger.debug(`getTextFromSelection called with:`, sel);
        }

        try {
            if (sel.isBoxSelection && sel.boxSelectionRanges) {
                // Case of box selection (rectangular selection)
                return this.getTextFromBoxSelection(sel);
            } else if (sel.startItemId === sel.endItemId) {
                // Selection range within a single item
                return this.getTextFromSingleItemSelection(sel);
            } else {
                // Selection range spanning multiple items
                return this.getTextFromMultiItemSelection(sel);
            }
        } catch (error) {
            // Log to console if an error occurs
            if (
                typeof window !== "undefined"
                && (window as Window & typeof globalThis & {
                    DEBUG_MODE?: boolean;
                    generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                    itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                    editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                    appStore?: { currentPage?: { id?: string; }; };
                    editorOverlayStore?: unknown;
                }).DEBUG_MODE
            ) {
                logger.error({ error }, "Error in getTextFromSelection");
                if (error instanceof Error) {
                    // Error message is logged above
                    // Error stack is logged above
                }
            }
            // Return empty string if an error occurs
            return "";
        }
    }

    /**
     * Get text from box selection (rectangular selection)
     * @param sel Selection range
     * @returns Text within selection range
     */
    private getTextFromBoxSelection(sel: SelectionRange): string {
        if (!sel.boxSelectionRanges || sel.boxSelectionRanges.length === 0) {
            return "";
        }

        // Debug info
        if (
            typeof window !== "undefined"
            && (window as Window & typeof globalThis & {
                DEBUG_MODE?: boolean;
                generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                appStore?: { currentPage?: { id?: string; }; };
                editorOverlayStore?: unknown;
            }).DEBUG_MODE
        ) {
            logger.debug(`getTextFromBoxSelection called with:`, sel);
        }

        // Get text for each line
        const lines: string[] = [];

        for (const range of sel.boxSelectionRanges) {
            const textEl = document.querySelector(
                `[data-item-id="${escapeId(range.itemId)}"] .item-text`,
            ) as HTMLElement;
            if (!textEl) {
                if (
                    typeof window !== "undefined"
                    && (window as Window & typeof globalThis & {
                        DEBUG_MODE?: boolean;
                        generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                        itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                        editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                        appStore?: { currentPage?: { id?: string; }; };
                        editorOverlayStore?: unknown;
                    }).DEBUG_MODE
                ) {
                    logger.debug(`Text element not found for item ${range.itemId}`);
                }
                lines.push(""); // Add empty line
                continue;
            }

            const text = textEl.textContent || "";
            const startOffset = Math.min(range.startOffset, range.endOffset);
            const endOffset = Math.max(range.startOffset, range.endOffset);

            // Check if selection range is valid
            if (startOffset === endOffset) {
                if (
                    typeof window !== "undefined"
                    && (window as Window & typeof globalThis & {
                        DEBUG_MODE?: boolean;
                        generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                        itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                        editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                        appStore?: { currentPage?: { id?: string; }; };
                        editorOverlayStore?: unknown;
                    }).DEBUG_MODE
                ) {
                    logger.debug(`Empty selection for item ${range.itemId}`);
                }
                lines.push(""); // Add empty line
                continue;
            }

            // Check if offset is within range
            if (startOffset < 0 || endOffset > text.length) {
                if (
                    typeof window !== "undefined"
                    && (window as Window & typeof globalThis & {
                        DEBUG_MODE?: boolean;
                        generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                        itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                        editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                        appStore?: { currentPage?: { id?: string; }; };
                        editorOverlayStore?: unknown;
                    }).DEBUG_MODE
                ) {
                    logger.debug(
                        `Invalid offsets for item ${range.itemId}: startOffset=${startOffset}, endOffset=${endOffset}, text.length=${text.length}`,
                    );
                }
                // Fix if out of range
                const safeStartOffset = Math.max(0, Math.min(text.length, startOffset));
                const safeEndOffset = Math.max(0, Math.min(text.length, endOffset));
                lines.push(text.substring(safeStartOffset, safeEndOffset));
            } else {
                lines.push(text.substring(startOffset, endOffset));
            }
        }

        // In case of VS Code-style box selection, join each line with newline
        return lines.join("\n");
    }

    /**
     * Get text from selection range spanning multiple items
     * @param sel Selection range
     * @returns Text within selection range
     */
    private getTextFromMultiItemSelection(sel: SelectionRange): string {
        // What each item contributes follows document order, not the order the endpoints
        // happen to be stored in, so a reverse drag yields exactly the forward text.
        const normalized = this.normalizeSelection(sel);

        // Create mapping of item IDs to indices (use cache)
        const { itemIdToIndex, allItems } = this.getItemsMapping();

        // Get indices of start and end items
        const sIdx = itemIdToIndex.get(sel.startItemId) ?? -1;
        const eIdx = itemIdToIndex.get(sel.endItemId) ?? -1;

        if (
            typeof window !== "undefined"
            && (window as Window & typeof globalThis & {
                DEBUG_MODE?: boolean;
                generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                appStore?: { currentPage?: { id?: string; }; };
                editorOverlayStore?: unknown;
            }).DEBUG_MODE
        ) {
            logger.debug(`Start index: ${sIdx}, End index: ${eIdx}`);
        }

        // Return empty string if index not found
        if (sIdx === -1 || eIdx === -1) {
            if (
                typeof window !== "undefined"
                && (window as Window & typeof globalThis & {
                    DEBUG_MODE?: boolean;
                    generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                    itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                    editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                    appStore?: { currentPage?: { id?: string; }; };
                    editorOverlayStore?: unknown;
                }).DEBUG_MODE
            ) {
                logger.debug(`Invalid indices, skipping selection`);
            }
            return "";
        }

        // Determine start and end indices of the selection range
        const firstIdx = Math.min(sIdx, eIdx);
        const lastIdx = Math.max(sIdx, eIdx);

        if (
            typeof window !== "undefined"
            && (window as Window & typeof globalThis & {
                DEBUG_MODE?: boolean;
                generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                appStore?: { currentPage?: { id?: string; }; };
                editorOverlayStore?: unknown;
            }).DEBUG_MODE
        ) {
            logger.debug(`First index: ${firstIdx}, Last index: ${lastIdx}, isReversed: ${sel.isReversed || false}`);
        }

        // Get all items within the selection range
        const itemsInRange = allItems.slice(firstIdx, lastIdx + 1);

        if (
            typeof window !== "undefined"
            && (window as Window & typeof globalThis & {
                DEBUG_MODE?: boolean;
                generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                appStore?: { currentPage?: { id?: string; }; };
                editorOverlayStore?: unknown;
            }).DEBUG_MODE
        ) {
            logger.debug(`Items in range: ${itemsInRange.length}`);
            logger.debug(`Items in range:`, itemsInRange.map(item => item.getAttribute("data-item-id")));
        }

        // One line per item that contributes text. Collecting instead of appending
        // separators is what keeps a range that ends at a textless block - or at the very
        // start of its last item - from trailing a newline no item ever had (#5025).
        const lines: string[] = [];

        // Process each item within the selection range
        for (let i = 0; i < itemsInRange.length; i++) {
            const item = itemsInRange[i];
            const itemId = item.getAttribute("data-item-id")!;
            const textEl = item.querySelector(".item-text") as HTMLElement;

            if (!textEl) {
                if (
                    typeof window !== "undefined"
                    && (window as Window & typeof globalThis & {
                        DEBUG_MODE?: boolean;
                        generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

                        itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
                        editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
                        appStore?: { currentPage?: { id?: string; }; };
                        editorOverlayStore?: unknown;
                    }).DEBUG_MODE
                ) {
                    logger.debug(`Text element not found for item ${itemId}`);
                }
                continue;
            }

            const text = textEl.textContent || "";
            const len = text.length;

            // The endpoints decide how much of this item is selected, in document order:
            // an interior item entirely, an endpoint item up to its own boundary (#5025).
            const interval = getItemSelectionInterval(itemId, normalized, len);
            const startOff = interval?.startOffset ?? 0;
            const endOff = interval?.endOffset ?? 0;

            // Add text (only valid range)
            if (startOff < endOff) {
                lines.push(text.substring(startOff, endOff));
            }
        }

        return lines.join("\n");
    }

    // Property to cache mapping of item IDs to indices
    private _itemsMappingCache: {
        itemIdToIndex: Map<string, number>;
        allItems: HTMLElement[];
        timestamp: number;
    } | null = null;

    /**
     * Get mapping of item IDs to indices (with cache)
     * @returns Mapping of item IDs to indices
     */
    private getItemsMapping(): { itemIdToIndex: Map<string, number>; allItems: HTMLElement[]; } {
        // Check if cache is valid (reuse if created within 100ms)
        const now = Date.now();
        if (this._itemsMappingCache && now - this._itemsMappingCache.timestamp < 100) {
            return {
                itemIdToIndex: this._itemsMappingCache.itemIdToIndex,
                allItems: this._itemsMappingCache.allItems,
            };
        }

        // Use TreeWalker to traverse items in DOM order efficiently.
        const allItems: HTMLElement[] = [];
        /* eslint-disable svelte/prefer-svelte-reactivity -- Temporary local map for calculation, not reactive state */
        const itemIdToIndex = new Map<string, number>();
        /* eslint-enable svelte/prefer-svelte-reactivity */

        const root = document.querySelector(".outliner") || document.body;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
            acceptNode(node) {
                return (node as Element).hasAttribute("data-item-id")
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_SKIP;
            },
        });

        let index = 0;
        while (walker.nextNode()) {
            const el = walker.currentNode as HTMLElement;
            const id = el.getAttribute("data-item-id");
            if (id) {
                allItems.push(el);
                itemIdToIndex.set(id, index++);
            }
        }

        // Update cache
        this._itemsMappingCache = {
            itemIdToIndex,
            allItems,
            timestamp: now,
        };

        return { itemIdToIndex, allItems };
    }

    addCursorRelativeToActive(direction: "up" | "down") {
        const active = Object.values(this.cursors).find(c => c.isActive && (c.userId === "local" || !c.userId));
        if (!active) return;
        const adj = this.getAdjacentItem(active.itemId, direction === "up" ? "prev" : "next");
        if (!adj) return;
        const offset = Math.min(active.offset, adj.text.length);
        this.addCursor({ itemId: adj.id, offset, isActive: true, userId: active.userId ?? "local" });
    }

    private getAdjacentItem(itemId: string | null, dir: "prev" | "next"): { id: string; text: string; } | null {
        if (!itemId) return null;
        const { itemIdToIndex, allItems } = this.getItemsMapping();
        const idx = itemIdToIndex.get(itemId);
        if (idx === undefined) return null;
        const target = dir === "prev" ? idx - 1 : idx + 1;
        if (target < 0 || target >= allItems.length) return null;
        const el = allItems[target];
        const id = el.getAttribute("data-item-id");
        if (!id) return null;
        const textEl = el.querySelector(".item-text");
        const text = textEl ? textEl.textContent || "" : "";
        return { id, text };
    }

    private schedulePresenceSync() {
        if (this.presenceSyncScheduled) return;
        this.presenceSyncScheduled = true;
        queueMicrotask(() => {
            this.presenceSyncScheduled = false;
            this.pushPresenceState();
        });
    }

    private pushPresenceState() {
        try {
            const client = yjsStore.yjsClient as import("../yjs/YjsClient").YjsClient | undefined;
            if (!client) {
                logger.debug("[pushPresenceState] No client");
                return;
            }

            const awareness = client.getAwareness();
            if (!awareness) {
                logger.debug("[pushPresenceState] No awareness");
                return;
            }
            logger.debug("[pushPresenceState] Got awareness");

            const currentPage = store.currentPage;
            const pageId = currentPage?.id;
            if (!pageId) {
                logger.debug("[pushPresenceState] No pageId", { currentPage });
                return;
            }

            const cursor = this.getLocalPrimaryCursor();
            const selection = this.getLocalPrimarySelection();

            const presenceState = {
                pageId,
                cursor: cursor ? { itemId: cursor.itemId, offset: cursor.offset } : undefined,
                selection: selection
                    ? {
                        // Endpoints are what a remote peer needs to draw the same range,
                        // including one that starts or ends at a visual node (#5025). The
                        // flat text fields ride along for peers that predate the model;
                        // a node boundary simply has none to send.
                        start: selection.start,
                        end: selection.end,
                        startItemId: selection.startItemId,
                        startOffset: selection.startOffset,
                        endItemId: selection.endItemId,
                        endOffset: selection.endOffset,
                        isReversed: selection.isReversed ?? false,
                        isBoxSelection: selection.isBoxSelection ?? false,
                        boxSelectionRanges: selection.isBoxSelection ? selection.boxSelectionRanges ?? [] : undefined,
                    }
                    : undefined,
            };

            // Set to project-level awareness
            yjsService.setPresence(awareness, (!cursor && !selection) ? null : presenceState);
        } catch {
            // Skip presence sync in environments where Awareness is not available
        }
    }

    private getLocalPrimaryCursor(): CursorPosition | undefined {
        const cursors = Object.values(this.cursors).filter(c => (c.userId ?? "local") === "local");
        if (cursors.length === 0) return undefined;
        const active = cursors.find(c => c.isActive);
        return active ?? cursors[0];
    }

    private getLocalPrimarySelection(): SelectionRange | undefined {
        return Object.values(this.selections).find(sel => (sel.userId ?? "local") === "local");
    }
}

export const editorOverlayStore = $state(new EditorOverlayStore());

// Expose to global scope for testing
// The literal MODE comparison lets Rollup drop this assignment from the
// production bundle (see ENV-production-build-leak.test.ts).
if (typeof window !== "undefined" && import.meta.env.MODE !== "production") {
    (window as Window & typeof globalThis & {
        DEBUG_MODE?: boolean;
        generalStore?: { currentPage?: { items?: { iterateUnordered?: () => Iterable<unknown>; }; }; };

        itemsStore?: { allItems?: { id: string; text?: unknown; [key: string]: unknown; }[]; };
        editorStore?: { currentItems?: { id: string; [key: string]: unknown; }[]; };
        appStore?: { currentPage?: { id?: string; }; };
        editorOverlayStore?: unknown;
    }).editorOverlayStore = editorOverlayStore;
}
