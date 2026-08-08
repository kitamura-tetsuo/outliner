import { tick } from "svelte";
import * as Y from "yjs";

import type { Item } from "../schema/app-schema";

import type { SelectionRange } from "../stores/EditorOverlayStore.svelte";
import { editorOverlayStore as store } from "../stores/EditorOverlayStore.svelte";
import { store as generalStore } from "../stores/store.svelte";
import { escapeId } from "../utils/domUtils";
import {
    getCurrentLineIndex,
    getDeepestDescendant,
    getLineEndOffset,
    getLineStartOffset,
    getSelectionForUser,
    hasSelection as storeHasSelection,
    resolveItemText,
    selectionSpansMultipleItems,
} from "./cursor";
import { collectAllItemIds, CursorNavigation, type CursorNavigationContext } from "./cursor/CursorNavigation";
import { searchItem } from "./cursor/CursorNavigationUtils";

import { type CursorEditingContext, CursorEditor } from "./cursor/CursorEditor";
import { getLogger } from "./logger";
import { yjsService } from "./yjs/service";
const logger = getLogger("Cursor");

export interface CursorOptions {
    itemId: string;
    offset: number;
    isActive: boolean;
    userId: string;
}

export class Cursor implements CursorEditingContext, CursorNavigationContext {
    cursorId: string;
    itemId: string;
    private _offset = 0;
    private caretAnchor: Y.RelativePosition | undefined;
    private observedText: Y.Text | undefined;
    private destroyed = false;
    private readonly handleObservedText = (_event: Y.YTextEvent, transaction: Y.Transaction) => {
        if (transaction.local) return;

        // Yjs observers run while the transaction is still being cleaned up. Rebase and
        // refresh the textarea afterwards, when the complete remote update is visible.
        queueMicrotask(() => {
            if (this.destroyed || !this.isActive || !store.cursorInstances.has(this.cursorId)) return;
            const rebasedOffset = this.offset;
            store.updateCursor({
                cursorId: this.cursorId,
                itemId: this.itemId,
                offset: rebasedOffset,
                isActive: this.isActive,
                userId: this.userId,
            });
            store.syncTextareaToActiveItem();
        });
    };
    isActive: boolean;
    userId: string;
    // Initial column position used for up/down key navigation.
    // Not private: CursorNavigation (a sibling module) reads/writes this via
    // the CursorNavigationContext interface to preserve column position when
    // moving between visual lines/items with the up/down arrow keys.
    private readonly editor: CursorEditor;
    private readonly navigation: CursorNavigation;
    initialColumn: number | null = null;

    private getSelection() {
        return getSelectionForUser(this.userId);
    }

    private hasSelection() {
        return storeHasSelection(this.userId);
    }

    private getSelectionAnchor(): { startItemId: string; startOffset: number; } {
        const existingSelection = this.getSelectionForCurrentItem();
        if (existingSelection) {
            return {
                startItemId: existingSelection.startItemId,
                startOffset: existingSelection.startOffset,
            };
        }
        return {
            startItemId: this.itemId,
            startOffset: this.offset,
        };
    }

    private getSelectionForCurrentItem() {
        const selection = this.getSelection();
        if (!selection) return undefined;
        if (selection.startItemId === this.itemId || selection.endItemId === this.itemId) {
            return selection;
        }
        return undefined;
    }

    constructor(cursorId: string, opts: CursorOptions) {
        this.cursorId = cursorId;
        this.itemId = opts.itemId;
        this.isActive = opts.isActive;
        this.userId = opts.userId;
        this.editor = new CursorEditor(this);
        this.navigation = new CursorNavigation(this);
        this.offset = opts.offset;
    }

    get offset(): number {
        if (this.caretAnchor) {
            const target = this.findTarget();
            const absolute = target && Y.createAbsolutePositionFromRelativePosition(this.caretAnchor, target.ydoc);
            if (absolute && absolute.type === this.observedText) {
                this._offset = absolute.index;
            }
        }
        return this._offset;
    }

    set offset(value: number) {
        this._offset = value;
        this.bindCaretAnchor();
    }

    private bindCaretAnchor(): void {
        const target = this.findTarget();
        // Some non-Yjs Item implementations (including lightweight Fluid test
        // stubs) do not expose a backing map; they keep using the numeric offset.
        const text = target?.yMap?.get("text");
        if (!(text instanceof Y.Text) || !text.doc) return;

        if (this.observedText !== text) {
            this.observedText?.unobserve(this.handleObservedText);
            this.observedText = text;
            text.observe(this.handleObservedText);
        }
        const safeOffset = Math.min(Math.max(0, this._offset), text.length);
        // Associate with the character to the left so our own insertion at the
        // caret does not advance the anchor before CursorEditor increments it.
        // Insertions strictly before the caret still rebase it as expected.
        this.caretAnchor = Y.createRelativePositionFromTypeIndex(text, safeOffset, -1);
    }

    // Cancels any pending async work owned by this cursor's editor (e.g. the
    // cursor-visibility recovery retry scheduled by deleteMultiItemSelection).
    // Must be called whenever a Cursor instance is removed so leaked timers
    // don't fire after the cursor/DOM they reference is gone.
    destroy(): void {
        this.destroyed = true;
        this.observedText?.unobserve(this.handleObservedText);
        this.observedText = undefined;
        this.caretAnchor = undefined;
        this.editor.destroy();
    }

    // Recursive search for Item on SharedTree
    private _findTarget(): Item | undefined {
        const root = generalStore.currentPage as Item | undefined;
        if (root) {
            const found = searchItem(root, this.itemId);
            if (found) return found;
        }

        // Fallback: search across all pages in the current project
        try {
            const proj = generalStore.project;
            const pages = proj?.items;
            if (pages && typeof pages.length === "number") {
                const len = pages.length;
                for (let i = 0; i < len; i++) {
                    const p = pages.at(i);
                    if (!p) continue;

                    const f = searchItem(p, this.itemId);
                    if (f) return f;
                }
            }
        } catch (_e) {
            logger.error(_e);
        }
        if (typeof window !== "undefined") {
            logger.debug("findTarget: not found", { itemId: this.itemId, rootId: root?.id });
        }
        return undefined;
    }

    // Recursive search for Item on SharedTree (CursorEditingContext interface implementation)
    findTarget(): Item | undefined {
        return this._findTarget();
    }

    private getTargetText(target: { text?: unknown; } | undefined): string {
        return resolveItemText(target);
    }

    applyToStore() {
        this.bindCaretAnchor();
        // Debug information
        if (
            typeof window !== "undefined"
            && window.DEBUG_MODE
        ) {
            logger.debug(
                `Cursor.applyToStore called for cursorId=${this.cursorId}, itemId=${this.itemId}, offset=${this.offset}`,
            );
        }

        // Update existing cursor
        store.updateCursor({
            cursorId: this.cursorId,
            itemId: this.itemId,
            offset: this.offset,
            isActive: this.isActive,
            userId: this.userId,
        });

        // Create new cursor instance if it does not exist
        const inst = store.cursorInstances.get(this.cursorId);
        if (!inst) {
            const cursorId = store.setCursor({
                itemId: this.itemId,
                offset: this.offset,
                isActive: this.isActive,
                userId: this.userId,
            });
            this.cursorId = cursorId;
        }

        // Set active item
        if (this.isActive) {
            store.setActiveItem(this.itemId);

            // Keep textarea in sync when we activate it
            store.syncTextareaToActiveItem();

            // Set focus to the global textarea
            const textarea = store.getTextareaRef();
            if (textarea) {
                // Multiple attempts to ensure focus is set
                textarea.focus();

                // Set focus using requestAnimationFrame and tick
                requestAnimationFrame(() => {
                    textarea.focus();

                    tick().then(() => {
                        textarea.focus();

                        // Debug information
                        if (
                            typeof window !== "undefined"
                            && window.DEBUG_MODE
                        ) {
                            logger.debug(
                                `Cursor.applyToStore: Focus set. Active element is textarea: ${
                                    document.activeElement === textarea
                                }`,
                            );
                        }
                    });
                });
            } else {
                // Log error if textarea is not found
                if (
                    typeof window !== "undefined"
                    && window.DEBUG_MODE
                ) {
                    logger.warn({}, "Cursor.applyToStore: Global textarea not found");
                }
            }
        }
    }

    // Reset initial column position when operations other than up/down keys are performed.
    // Not private: CursorNavigation calls this via the CursorNavigationContext interface.
    resetInitialColumn() {
        this.initialColumn = null;
    }

    // Visual-line-aware cursor navigation (moveLeft/moveRight/moveUp/moveDown and the
    // shared navigateToItem helper) is implemented in CursorNavigation, including
    // every DOM fallback path (TreeWalker traversal, depth-first tree collection,
    // the "ultimate fallback", and the parentCollection.parentKey check in moveUp).
    // These methods just delegate so callers see the exact same public API.
    moveLeft() {
        this.navigation.moveLeft();
    }

    moveRight() {
        this.navigation.moveRight();
    }

    moveUp() {
        this.navigation.moveUp();
    }

    moveDown() {
        this.navigation.moveDown();
    }

    /**
     * Insert text
     * @param ch Text to insert
     */
    insertText(ch: string) {
        this.resetInitialColumn();
        this.editor.insertText(ch);
    }

    /**
     * Delete the character before the cursor position
     */
    deleteBackward() {
        this.resetInitialColumn();
        this.editor.deleteBackward();
    }

    /**
     * Delete the character after the cursor position
     */
    deleteForward() {
        this.resetInitialColumn();
        this.editor.deleteForward();
    }

    deleteMultiItemSelection(selection: SelectionRange) {
        this.editor.deleteMultiItemSelection(selection);
    }

    insertLineBreak() {
        this.editor.insertLineBreak();
    }

    insertItemBelow() {
        this.editor.insertItemBelow();
    }

    onInput(event: InputEvent) {
        this.editor.onInput(event);
    }

    /**
     * Handle keyboard events
     * @param event Keyboard event
     * @returns Whether the event was handled
     */
    onBeforeInput(event: InputEvent) {
        this.editor.onBeforeInput(event);
    }

    onKeyDown(event: KeyboardEvent): boolean {
        // Debug information
        if (
            typeof window !== "undefined"
            && window.DEBUG_MODE
        ) {
            logger.debug(
                `onKeyDown called with key=${event.key}, ctrlKey=${event.ctrlKey}, shiftKey=${event.shiftKey}`,
            );
        }

        // Check if there is a selection
        const hasSelection = this.hasSelection();
        const activeSelection = hasSelection ? this.getSelection() : undefined;

        // Debug information
        if (
            typeof window !== "undefined"
            && window.DEBUG_MODE
        ) {
            logger.debug(`Has selection: ${hasSelection}`);
            if (activeSelection) {
                logger.debug(`Selections:`, [activeSelection]);
            }
        }

        // Special operations when Ctrl/Cmd key is pressed
        if (event.ctrlKey || event.metaKey) {
            switch (event.key) {
                case "a":
                case "A":
                    this.selectAll();
                    break;
                case "c":
                case "C":
                    this.copySelectedText();
                    return true;
                case "x":
                case "X":
                    this.cutSelectedText();
                    return true;
                case "v":
                case "V":
                    // Leave paste processing to the browser's default behavior
                    return false;
                case "ArrowLeft":
                    this.outdent();
                    break;
                case "ArrowRight":
                    this.indent();
                    break;
                case "ArrowUp":
                    this.moveItemUp();
                    break;
                case "ArrowDown":
                    this.moveItemDown();
                    break;
                case "Home":
                    if (event.shiftKey) {
                        this.extendSelectionToDocumentStart();
                    } else {
                        this.moveToDocumentStart();
                    }
                    break;
                case "End":
                    if (event.shiftKey) {
                        this.extendSelectionToDocumentEnd();
                    } else {
                        this.moveToDocumentEnd();
                    }
                    break;
                case "PageUp":
                    this.pageUp();
                    break;
                case "PageDown":
                    this.pageDown();
                    break;
                case "Enter":
                    this.insertItemBelow();
                    break;
                case "\\":
                    if (event.shiftKey) {
                        this.jumpToMatchingBracket();
                        break;
                    } else {
                        return false;
                    }
                default:
                    return false;
            }
        } else if (event.altKey && !event.shiftKey) {
            switch (event.key) {
                case "ArrowUp":
                    this.moveSubtreeUp();
                    break;
                case "ArrowDown":
                    this.moveSubtreeDown();
                    break;
                default:
                    return false;
            }
        } // Extend selection if Shift key is pressed
        else if (event.shiftKey) {
            switch (event.key) {
                case "ArrowLeft":
                    this.extendSelectionLeft();
                    break;
                case "ArrowRight":
                    this.extendSelectionRight();
                    break;
                case "ArrowUp":
                    this.extendSelectionUp();
                    break;
                case "ArrowDown":
                    this.extendSelectionDown();
                    break;
                case "PageUp":
                    this.extendSelectionPageUp();
                    break;
                case "PageDown":
                    this.extendSelectionPageDown();
                    break;
                case "Home":
                    this.extendSelectionToLineStart();
                    break;
                case "End":
                    this.extendSelectionToLineEnd();
                    break;
                case "Enter":
                    this.insertLineBreak();
                    break;
                case "Tab":
                    this.outdent();
                    break;
                default:
                    return false;
            }
        } else {
            // Normal cursor movement
            switch (event.key) {
                case "ArrowLeft":
                    if (hasSelection) {
                        // If there is a selection, move cursor to the start of selection and clear it
                        this.clearSelection();
                    } else {
                        this.moveLeft();
                    }
                    break;
                case "ArrowRight":
                    if (hasSelection) {
                        // If there is a selection, move cursor to the end of selection and clear it
                        this.clearSelection();
                    } else {
                        this.moveRight();
                    }
                    break;
                case "ArrowUp":
                    if (hasSelection) {
                        // If there is a selection, clear it before moving
                        this.clearSelection();
                    }
                    this.moveUp();
                    break;
                case "ArrowDown":
                    if (hasSelection) {
                        // If there is a selection, clear it before moving
                        this.clearSelection();
                    }
                    this.moveDown();
                    break;
                case "Home":
                    if (hasSelection) {
                        // If there is a selection, clear it before moving
                        this.clearSelection();
                    }
                    this.moveToLineStart();
                    break;
                case "End":
                    if (hasSelection) {
                        // If there is a selection, clear it before moving
                        this.clearSelection();
                    }
                    this.moveToLineEnd();
                    break;
                case "PageUp":
                    if (hasSelection) {
                        this.clearSelection();
                    }
                    this.pageUp();
                    break;
                case "PageDown":
                    if (hasSelection) {
                        this.clearSelection();
                    }
                    this.pageDown();
                    break;
                case "Backspace":
                    // If there is a selection, delete it
                    if (hasSelection) {
                        const selection = this.getSelection();
                        if (selection) {
                            // If the selection spans multiple items
                            if (selectionSpansMultipleItems(selection)) {
                                this.deleteMultiItemSelection(selection);
                            } else {
                                // If the selection is within a single item
                                this.deleteSelection();
                            }
                        }
                    } else {
                        // Normal Backspace processing
                        this.deleteBackward();
                    }
                    break;
                case "Delete":
                    // If there is a selection, delete it
                    if (hasSelection) {
                        const selection = this.getSelection();
                        if (selection) {
                            // If the selection spans multiple items
                            if (selectionSpansMultipleItems(selection)) {
                                this.deleteMultiItemSelection(selection);
                            } else {
                                // If the selection is within a single item
                                this.deleteSelection();
                            }
                        }
                    } else {
                        // Normal Delete processing
                        this.deleteForward();
                    }
                    break;
                case "Enter":
                    // If there is a selection, delete it before inserting a line break
                    if (hasSelection) {
                        const selection = this.getSelection();
                        if (selection) {
                            // If the selection spans multiple items
                            if (selectionSpansMultipleItems(selection)) {
                                this.deleteMultiItemSelection(selection);
                            } else {
                                // If the selection is within a single item
                                this.deleteSelection();
                            }
                        }
                    }
                    this.insertLineBreak();
                    break;
                case "Escape":
                    this.clearSelection();
                    break;
                case "Tab":
                    this.indent();
                    break;
                default:
                    return false;
            }
        }

        // Start cursor blinking
        store.startCursorBlink();
        return true;
    }

    private calculateIsReversed(
        startItemId: string,
        startOffset: number,
        endItemId: string,
        endOffset: number,
    ): boolean {
        // If start and end are in the same item, determine direction by offset
        if (startItemId === endItemId) {
            return startOffset > endOffset;
        }

        // If in different items, determine direction by DOM order
        if (typeof document !== "undefined") {
            const startEl = document.querySelector(`[data-item-id="${escapeId(startItemId)}"]`);
            const endEl = document.querySelector(`[data-item-id="${escapeId(endItemId)}"]`);

            if (startEl && endEl) {
                const comparison = startEl.compareDocumentPosition(endEl);
                if (comparison & Node.DOCUMENT_POSITION_PRECEDING) {
                    return true; // end is before start
                }
                if (comparison & Node.DOCUMENT_POSITION_FOLLOWING) {
                    return false; // end is after start
                }
            }
        }

        // If not found in DOM, use Tree structure to determine order (fallback)
        const root = generalStore.currentPage as import("../schema/app-schema").Item;
        if (root) {
            const allItemIds = collectAllItemIds(root, []);
            const startIdx = allItemIds.indexOf(startItemId);
            const endIdx = allItemIds.indexOf(endItemId);

            if (startIdx !== -1 && endIdx !== -1) {
                return startIdx > endIdx;
            }
        }

        return false;
    }

    private updateSelectionAfterMove(startItemId: string, startOffset: number) {
        const endItemId = this.itemId;
        const endOffset = this.offset;
        const isReversed = this.calculateIsReversed(startItemId, startOffset, endItemId, endOffset);

        // Clear existing selection for the same user before setting new range
        store.clearSelectionForUser(this.userId);

        const hasSelection = startItemId !== endItemId || startOffset !== endOffset;

        // Set selection
        store.setSelection({
            startItemId,
            startOffset,
            endItemId,
            endOffset,
            userId: this.userId,
            isReversed,
        });

        // Set selection range for global textarea
        this.updateGlobalTextareaSelection(startItemId, startOffset, endItemId, endOffset);

        // Wait a bit for DOM reflection to ensure selection is correctly created
        if (typeof window !== "undefined" && hasSelection) {
            tick().then(() => {
                setTimeout(() => {
                    if (typeof document === "undefined") return;
                    const selectionElements = document.querySelectorAll(".editor-overlay .selection");

                    // Reset selection if not displayed
                    if (selectionElements.length === 0) {
                        store.clearSelectionForUser(this.userId);
                        store.setSelection({
                            startItemId,
                            startOffset,
                            endItemId,
                            endOffset,
                            userId: this.userId,
                            isReversed,
                        });

                        // Force update selection display

                        if (typeof (store as { forceUpdate?: () => void; }).forceUpdate === "function") {
                            (store as { forceUpdate?: () => void; }).forceUpdate?.();
                        }
                    }
                }, 150); // Increase timeout to 150ms to allow more time for DOM updates
            });
        }
    }

    // Extend selection to the left
    extendSelectionLeft() {
        const target = this.findTarget();
        if (!target) return;

        const { startItemId, startOffset } = this.getSelectionAnchor();

        // Move cursor left (Update Focus)
        this.moveLeft();

        this.updateSelectionAfterMove(startItemId, startOffset);
    }

    // Extend selection to the right
    extendSelectionRight() {
        const target = this.findTarget();
        if (!target) return;

        const { startItemId, startOffset } = this.getSelectionAnchor();

        // Move cursor right (Update Focus)
        this.moveRight();

        this.updateSelectionAfterMove(startItemId, startOffset);
    }

    // Extend selection up
    extendSelectionUp(): void {
        const target = this.findTarget();
        if (!target) return;

        const { startItemId, startOffset } = this.getSelectionAnchor();

        // Move cursor up (Update Focus)
        this.moveUp();

        this.updateSelectionAfterMove(startItemId, startOffset);
    }

    // Extend selection down
    extendSelectionDown() {
        const target = this.findTarget();
        if (!target) return;

        const { startItemId, startOffset } = this.getSelectionAnchor();

        // Move cursor down (Update Focus)
        this.moveDown();

        this.updateSelectionAfterMove(startItemId, startOffset);
    }

    // Move cursor to the start of the line
    moveToLineStart() {
        this.resetInitialColumn();
        const target = this.findTarget();
        if (!target) return;

        const text = this.getTargetText(target);
        const currentLineIndex = getCurrentLineIndex(text, this.offset);

        // Move to the start of the current line
        this.offset = getLineStartOffset(text, currentLineIndex);
        this.applyToStore();

        // Ensure cursor is correctly updated
        store.startCursorBlink();
    }

    // Move cursor to the end of the line
    moveToLineEnd() {
        this.resetInitialColumn();
        const target = this.findTarget();
        if (!target) return;

        const text = this.getTargetText(target);
        const currentLineIndex = getCurrentLineIndex(text, this.offset);

        // Move to the end of the current line
        this.offset = getLineEndOffset(text, currentLineIndex);
        this.applyToStore();

        // Ensure cursor is correctly updated
        store.startCursorBlink();
    }

    // Extend selection to the start of the line
    extendSelectionToLineStart() {
        const target = this.findTarget();
        if (!target) return;

        const text = this.getTargetText(target);
        const currentLineIndex = getCurrentLineIndex(text, this.offset);
        const lineStartOffset = getLineStartOffset(text, currentLineIndex);

        // If current cursor position is already at line start, do nothing (only if no selection)
        if (this.offset === lineStartOffset && !this.getSelectionForCurrentItem()) {
            return;
        }

        const { startItemId, startOffset } = this.getSelectionAnchor();

        // Move cursor to line start
        this.offset = lineStartOffset;
        this.updateSelectionAfterMove(startItemId, startOffset);
        this.applyToStore();
    }

    // Extend selection to the end of the line
    extendSelectionToLineEnd() {
        const target = this.findTarget();
        if (!target) return;

        const text = this.getTargetText(target);
        const currentLineIndex = getCurrentLineIndex(text, this.offset);
        const lineEndOffset = getLineEndOffset(text, currentLineIndex);

        // If current cursor position is already at line end, do nothing (only if no selection)
        if (this.offset === lineEndOffset && !this.getSelectionForCurrentItem()) {
            return;
        }

        const { startItemId, startOffset } = this.getSelectionAnchor();

        // Move cursor to line end
        this.offset = lineEndOffset;
        this.updateSelectionAfterMove(startItemId, startOffset);
        this.applyToStore();
    }

    /**
     * Clear selection
     */
    clearSelection() {
        // Clear selection
        store.clearSelectionForUser(this.userId);
    }

    // --- Extended navigation commands ---

    // Move left by word
    moveWordLeft() {
        const target = this.findTarget();
        if (!target) return;

        const text = this.getTargetText(target);

        // If text is empty, just return without changing anything
        if (text.length === 0) {
            return;
        }

        let pos = this.offset;
        if (pos > 0) {
            pos--;
            while (pos > 0 && /\s/.test(text[pos])) pos--;
            while (pos > 0 && !/\s/.test(text[pos - 1])) pos--;
        }
        this.offset = pos;
        this.applyToStore();
        store.startCursorBlink();
    }

    // Move right by word
    moveWordRight() {
        const target = this.findTarget();
        if (!target) return;

        // Check if text exists and is not null/undefined before using it

        const text = this.getTargetText(target);
        if (text.length === 0) {
            return;
        }
        let pos = this.offset;
        const len = text.length;
        if (pos < len) {
            // Skip any whitespace to the right
            while (pos < len && /\s/.test(text[pos])) pos++;

            // Skip the entire word to the right (non-whitespace characters)
            while (pos < len && !/\s/.test(text[pos])) pos++;
        }
        this.offset = pos;
        this.applyToStore();
        store.startCursorBlink();
    }

    // Jump to matching bracket
    jumpToMatchingBracket() {
        const target = this.findTarget();
        if (!target) return;

        const text = this.getTargetText(target);
        const pos = this.offset;
        const before = text[pos - 1];
        const current = text[pos];

        if (current === "[") {
            const close = text.indexOf("]", pos + 1);
            if (close !== -1) {
                this.offset = close + 1;
            }
        } else if (before === "[") {
            const close = text.indexOf("]", pos);
            if (close !== -1) {
                this.offset = close + 1;
            }
        } else if (current === "]") {
            const open = text.lastIndexOf("[", pos - 1);
            if (open !== -1) {
                this.offset = open;
            }
        } else if (before === "]") {
            const open = text.lastIndexOf("[", pos - 2);
            if (open !== -1) {
                this.offset = open;
            }
        }

        this.applyToStore();
        store.startCursorBlink();
    }

    // Move to document start
    moveToDocumentStart() {
        this.resetInitialColumn();
        const root = generalStore.currentPage;
        if (!root) return;

        this.itemId = root.id;
        this.offset = 0;
        // This clears existing selection when moving without shift
        this.clearSelection();
        this.applyToStore();
        store.startCursorBlink();
    }

    // Extend selection to document start
    extendSelectionToDocumentStart() {
        const { startItemId, startOffset } = this.getSelectionAnchor();

        this.resetInitialColumn();
        const root = generalStore.currentPage;
        if (!root) return;

        this.itemId = root.id;
        this.offset = 0;
        this.updateSelectionAfterMove(startItemId, startOffset);
        this.applyToStore();
        store.startCursorBlink();
    }

    // Extend selection to document end
    extendSelectionToDocumentEnd() {
        const { startItemId, startOffset } = this.getSelectionAnchor();

        this.resetInitialColumn();
        const root = generalStore.currentPage;
        if (!root) return;

        // Ensure root is treated simply as an Item here, to bypass TS strictness errors when structural typing fails for deep nested values
        const deepest = getDeepestDescendant(root);
        this.itemId = deepest.id;
        this.offset = (deepest.text || "").length;
        this.updateSelectionAfterMove(startItemId, startOffset);
        this.applyToStore();
        store.startCursorBlink();
    }

    // Move to document end
    moveToDocumentEnd() {
        this.resetInitialColumn();
        const root = generalStore.currentPage;
        if (!root) return;

        // Ensure root is treated simply as an Item here, to bypass TS strictness errors when structural typing fails for deep nested values
        const deepest = getDeepestDescendant(root);
        this.itemId = deepest.id;
        this.offset = (deepest.text || "").length;
        // This clears existing selection when moving without shift
        this.clearSelection();
        this.applyToStore();
        store.startCursorBlink();
    }

    // PageUp/PageDown equivalent movement (10 lines)
    pageUp() {
        for (let i = 0; i < 10; i++) this.moveUp();
    }

    pageDown() {
        for (let i = 0; i < 10; i++) this.moveDown();
    }

    extendSelectionPageUp() {
        for (let i = 0; i < 10; i++) this.extendSelectionUp();
    }

    extendSelectionPageDown() {
        for (let i = 0; i < 10; i++) this.extendSelectionDown();
    }

    // Scroll operations
    scrollUp() {
        if (typeof window !== "undefined") window.scrollBy(0, -100);
    }

    scrollDown() {
        if (typeof window !== "undefined") window.scrollBy(0, 100);
    }

    altPageUp() {
        if (typeof window !== "undefined") window.scrollBy(0, -window.innerHeight);
    }

    altPageDown() {
        if (typeof window !== "undefined") window.scrollBy(0, window.innerHeight);
    }

    moveItemUp() {
        const project = generalStore.project;
        if (project) {
            yjsService.moveItemUp(project, this.itemId);
        }
    }

    moveItemDown() {
        const project = generalStore.project;
        if (project) {
            yjsService.moveItemDown(project, this.itemId);
        }
    }

    moveSubtreeUp() {
        const project = generalStore.project;
        if (project) {
            yjsService.moveSubtreeUp(project, this.itemId);
        }
    }

    moveSubtreeDown() {
        const project = generalStore.project;
        if (project) {
            yjsService.moveSubtreeDown(project, this.itemId);
        }
    }

    indent() {
        const project = generalStore.project;
        if (project) {
            yjsService.indentItem(project, this.itemId);
        }
    }

    outdent() {
        const project = generalStore.project;
        if (project) {
            yjsService.outdentItem(project, this.itemId);
        }
    }

    // Formatting methods are defined below

    /**
     * Select the entire current page, from offset 0 of the page-title item
     * through the end of the page's last depth-first descendant.
     */
    selectAll() {
        const root = generalStore.currentPage;
        if (!root) return;

        const deepest = getDeepestDescendant(root);
        const endText = deepest.text || "";

        // Clear existing selection for the same user before setting new range
        store.clearSelectionForUser(this.userId);

        // Set selection
        store.setSelection({
            startItemId: root.id,
            startOffset: 0,
            endItemId: deepest.id,
            endOffset: endText.length,
            userId: this.userId,
            isReversed: false,
        });

        // Set selection range for global textarea
        this.updateGlobalTextareaSelection(root.id, 0, deepest.id, endText.length);

        // Set cursor position to the end
        this.itemId = deepest.id;
        this.offset = endText.length;
        this.applyToStore();

        // Start cursor blinking
        store.startCursorBlink();
    }

    // Extend selection with Shift+Alt+Right
    expandSelection() {
        const target = this.findTarget();
        if (!target) return;

        const text = this.getTargetText(target);
        const selection = this.getSelection();

        const startOffset = selection ? Math.min(selection.startOffset, selection.endOffset) : this.offset;

        store.setSelection({
            startItemId: this.itemId,
            startOffset,
            endItemId: this.itemId,
            endOffset: text.length,
            userId: this.userId,
            isReversed: false,
        });

        this.updateGlobalTextareaSelection(this.itemId, startOffset, this.itemId, text.length);

        this.offset = text.length;
        this.applyToStore();
        store.startCursorBlink();
    }

    // Shrink selection with Shift+Alt+Left
    shrinkSelection() {
        const selection = this.getSelection();
        if (!selection) return;

        const newOffset = Math.min(selection.startOffset, selection.endOffset);
        this.offset = newOffset;
        this.clearSelection();
        this.updateGlobalTextareaSelection(this.itemId, newOffset, this.itemId, newOffset);
        this.applyToStore();
        store.startCursorBlink();
    }

    // Select current line with Ctrl+L
    selectLine() {
        const target = this.findTarget();
        if (!target) return;

        const text = this.getTargetText(target);
        const currentLineIndex = getCurrentLineIndex(text, this.offset);
        const startOffset = getLineStartOffset(text, currentLineIndex);
        const endOffset = getLineEndOffset(text, currentLineIndex);

        store.setSelection({
            startItemId: this.itemId,
            startOffset,
            endItemId: this.itemId,
            endOffset,
            userId: this.userId,
            isReversed: false,
        });

        this.updateGlobalTextareaSelection(this.itemId, startOffset, this.itemId, endOffset);

        this.offset = endOffset;
        this.applyToStore();
        store.startCursorBlink();
    }

    /**
     * Copy selected text
     */
    copySelectedText() {
        this.editor.copySelectedText();
    }

    /**
     * Cut selected text
     */
    cutSelectedText() {
        this.editor.cutSelectedText();
    }

    /**
     * Delete selection spanning multiple items
     */

    /**
     * Delete selection
     */
    deleteSelection() {
        this.editor.deleteSelection();
    }

    /**
     * Navigate between items.
     * Delegates to CursorNavigation, which preserves every DOM fallback path
     * from the original implementation (TreeWalker traversal, depth-first
     * tree collection, and the "ultimate fallback").
     * @param direction Direction of movement
     */
    private navigateToItem(direction: "left" | "right" | "up" | "down") {
        this.navigation.navigateToItem(direction);
    }

    /**
     * Set selection range for global textarea
     * @param startItemId Start item ID
     * @param startOffset Start offset
     * @param endItemId End item ID
     * @param endOffset End offset
     */
    updateGlobalTextareaSelection(startItemId: string, startOffset: number, endItemId: string, endOffset: number) {
        store.syncTextareaToSelection(startItemId, startOffset, endItemId, endOffset);
    }

    /**
     * Change selected text to bold (Scrapbox syntax: [[text]])
     */
    formatBold() {
        this.editor.formatBold();
    }

    /**
     * Change selected text to italic (Scrapbox syntax: [/ text])
     */
    formatItalic() {
        this.editor.formatItalic();
    }

    /**
     * Add underline to selected text (Using HTML tags)
     */
    formatUnderline() {
        this.editor.formatUnderline();
    }

    /**
     * Add strikethrough to selected text (Scrapbox syntax: [- text])
     */
    formatStrikethrough() {
        this.editor.formatStrikethrough();
    }

    /**
     * Change selected text to code (Scrapbox syntax: `text`)
     */
    formatCode() {
        this.editor.formatCode();
    }
}
