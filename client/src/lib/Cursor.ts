import type { Item } from "../schema/app-schema";
import type { SelectionRange } from "../stores/EditorOverlayStore.svelte";
import { editorOverlayStore as store } from "../stores/EditorOverlayStore.svelte";
import { store as generalStore } from "../stores/store.svelte";
import {
    findNextItem,
    findPreviousItem,
    getCurrentColumn,
    getCurrentLineIndex,
    getLineEndOffset,
    getLineStartOffset,
    getSelectionForUser,
    getVisualLineInfo,
    getVisualLineOffsetRange,
    hasSelection as storeHasSelection,
    searchItem,
    selectionSpansMultipleItems,
} from "./cursor";
import { type CursorEditingContext, CursorEditor } from "./cursor/CursorEditor";

interface CursorOptions {
    itemId: string;
    offset: number;
    isActive: boolean;
    userId: string;
}

export class Cursor implements CursorEditingContext {
    cursorId: string;
    itemId: string;
    offset: number;
    isActive: boolean;
    userId: string;
    // Initial column position used for up/down key navigation
    private readonly editor: CursorEditor;
    private initialColumn: number | null = null;

    private getSelection() {
        return getSelectionForUser(this.userId);
    }

    private hasSelection() {
        return storeHasSelection(this.userId);
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
        this.offset = opts.offset;
        this.isActive = opts.isActive;
        this.userId = opts.userId;
        this.editor = new CursorEditor(this as any);
    }

    // Recursive search for Item on SharedTree
    private _findTarget(): Item | undefined {
        const root = generalStore.currentPage as Item | undefined;
        if (root) {
            const found = searchItem(root as any, this.itemId) as Item | undefined;
            if (found) return found;
        }
        // Fallback: search across all pages in the current project
        try {
            const proj: { items?: Iterable<Item>; } | undefined = (generalStore as any).project;
            const pages: Iterable<Item> | undefined = proj?.items;
            if (pages && pages[Symbol.iterator]) {
                for (const p of pages) {
                    const f = searchItem(p as any, this.itemId) as Item | undefined;
                    if (f) return f;
                }
            }
        } catch {}
        if (typeof window !== "undefined") {
            console.debug("findTarget: not found", { itemId: this.itemId, rootId: root?.id });
        }
        return undefined;
    }

    indent() {
        if (typeof window !== "undefined") {
            const selection = this.getSelection();
            if (selection && selection.startItemId !== selection.endItemId) {
                const allItems = Array.from(document.querySelectorAll("[data-item-id]"));
                const allItemIds = allItems.map(el => el.getAttribute("data-item-id")!);
                const startIdx = allItemIds.indexOf(selection.startItemId);
                const endIdx = allItemIds.indexOf(selection.endItemId);

                if (startIdx !== -1 && endIdx !== -1) {
                    const firstIdx = Math.min(startIdx, endIdx);
                    const lastIdx = Math.max(startIdx, endIdx);

                    for (let i = firstIdx; i <= lastIdx; i++) {
                        window.dispatchEvent(
                            new CustomEvent("outliner-indent", {
                                detail: { itemId: allItemIds[i] },
                            }),
                        );
                    }
                    return;
                }
            }

            window.dispatchEvent(
                new CustomEvent("outliner-indent", {
                    detail: { itemId: this.itemId },
                }),
            );
        }
    }

    unindent() {
        if (typeof window !== "undefined") {
            const selection = this.getSelection();
            if (selection && selection.startItemId !== selection.endItemId) {
                const allItems = Array.from(document.querySelectorAll("[data-item-id]"));
                const allItemIds = allItems.map(el => el.getAttribute("data-item-id")!);
                const startIdx = allItemIds.indexOf(selection.startItemId);
                const endIdx = allItemIds.indexOf(selection.endItemId);

                if (startIdx !== -1 && endIdx !== -1) {
                    const firstIdx = Math.min(startIdx, endIdx);
                    const lastIdx = Math.max(startIdx, endIdx);

                    for (let i = firstIdx; i <= lastIdx; i++) {
                        window.dispatchEvent(
                            new CustomEvent("outliner-unindent", {
                                detail: { itemId: allItemIds[i] },
                            }),
                        );
                    }
                    return;
                }
            }

            window.dispatchEvent(
                new CustomEvent("outliner-unindent", {
                    detail: { itemId: this.itemId },
                }),
            );
        }
    }

    // Recursive search for Item on SharedTree (CursorEditingContext interface implementation)
    findTarget(): any {
        return this._findTarget();
    }

    private getTargetText(target: Item | undefined): string {
        const raw = target?.text;
        if (typeof raw === "string") return raw;
        if (raw && typeof (raw as any).toString === "function") {
            try {
                return (raw as any).toString();
            } catch {}
        }
        return raw == null ? "" : String(raw);
    }

    applyToStore() {
        // Debug information
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(
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

            // Set focus to the global textarea
            const textarea = store.getTextareaRef();
            if (textarea) {
                // Multiple attempts to ensure focus is set
                textarea.focus();

                // Set focus using requestAnimationFrame
                requestAnimationFrame(() => {
                    textarea.focus();

                    // Use setTimeout as well for extra reliability
                    setTimeout(() => {
                        textarea.focus();

                        // Debug information
                        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                            console.log(
                                `Cursor.applyToStore: Focus set. Active element is textarea: ${
                                    document.activeElement === textarea
                                }`,
                            );
                        }
                    }, 10);
                });
            } else {
                // Log error if textarea is not found
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.error(`Cursor.applyToStore: Global textarea not found`);
                }
            }
        }
    }

    // Reset initial column position when operations other than up/down keys are performed
    private resetInitialColumn() {
        this.initialColumn = null;
    }

    moveLeft() {
        // Reset initial column position as this is not an up/down key operation
        this.resetInitialColumn();

        const target = this.findTarget();
        if (!target) return;

        if (this.offset > 0) {
            this.offset = Math.max(0, this.offset - 1);
            this.applyToStore();

            // Ensure cursor is correctly updated
            store.startCursorBlink();
        } else {
            // Move to previous item at start of line
            this.navigateToItem("left");
        }
    }

    moveRight() {
        // Reset initial column position as this is not an up/down key operation
        this.resetInitialColumn();

        const target = this.findTarget();
        const text = this.getTargetText(target);

        // If at or beyond the end of the current item, find next item directly in DOM
        if (text.length > 0 && this.offset >= text.length) {
            // Try to find the next item directly in the DOM first
            if (typeof document !== "undefined") {
                const currentItemElement = document.querySelector(`[data-item-id="${this.itemId}"]`);
                if (currentItemElement) {
                    const allItems = Array.from(document.querySelectorAll("[data-item-id]"));
                    const currentIndex = allItems.indexOf(currentItemElement);
                    if (currentIndex !== -1 && currentIndex < allItems.length - 1) {
                        const nextElement = allItems[currentIndex + 1] as HTMLElement;
                        const nextItemId = nextElement.getAttribute("data-item-id");

                        if (nextItemId && nextItemId !== this.itemId) {
                            // Set the new item and offset
                            this.itemId = nextItemId;
                            this.offset = 0;

                            // Update the store to reflect the changes
                            this.applyToStore();

                            // Start cursor blinking
                            store.startCursorBlink();

                            // Exit early since we've manually handled the navigation
                            return;
                        }
                    }
                }
            }

            // Fallback to navigateToItem if DOM approach didn't work
            this.navigateToItem("right");
        } else if (text.length > 0 && this.offset < text.length) {
            // Within the current item, just move the cursor right by one position
            this.offset = this.offset + 1;
            this.applyToStore();

            // Ensure cursor is correctly updated
            store.startCursorBlink();
        } else {
            // Empty text case - try to move to next item
            this.navigateToItem("right");
        }
    }

    moveUp() {
        const target = this.findTarget();
        if (!target) return;

        // Debug information
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`moveUp called for itemId=${this.itemId}, offset=${this.offset}`);
        }

        // Get visual line information
        const visualLineInfo = getVisualLineInfo(this.itemId, this.offset);

        // Debug information
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`getVisualLineInfo result:`, visualLineInfo);
        }

        if (!visualLineInfo) {
            // Fallback: Logical line processing (based on newline characters)
            const text = this.getTargetText(target);
            const currentLineIndex = getCurrentLineIndex(text, this.offset);
            if (currentLineIndex > 0) {
                const prevLineStart = getLineStartOffset(text, currentLineIndex - 1);
                this.offset = prevLineStart;
                this.applyToStore();
                store.startCursorBlink();
            } else {
                this.navigateToItem("up");
            }
            return;
        }

        const { lineIndex, lineStartOffset, totalLines } = visualLineInfo;

        // Calculate current column position (position within visual line)
        const currentColumn = this.offset - lineStartOffset;

        // Set or update initial column position
        if (this.initialColumn === null) {
            this.initialColumn = currentColumn;
        }

        // Column position to use (initial column position)
        const targetColumn = this.initialColumn;

        // Debug information
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(
                `Visual line info: lineIndex=${lineIndex}, totalLines=${totalLines}, currentColumn=${currentColumn}, targetColumn=${targetColumn}`,
            );
        }

        if (lineIndex > 0) {
            // Move to the visual line above within the same item
            const prevLineRange = getVisualLineOffsetRange(this.itemId, lineIndex - 1);
            if (prevLineRange) {
                const prevLineLength = prevLineRange.endOffset - prevLineRange.startOffset;
                // Move to the initial column position or the line length, whichever is shorter
                this.offset = prevLineRange.startOffset + Math.min(targetColumn, prevLineLength);
                this.applyToStore();

                // Debug information
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(
                        `Moved to previous visual line in same item: offset=${this.offset}, targetColumn=${targetColumn}`,
                    );
                }

                // Start cursor blinking
                store.startCursorBlink();
            }
        } else {
            // Find the previous item
            const prevItem = findPreviousItem(this.itemId);
            // Also check for parent item when there's no previous sibling
            // Note: item.parent returns Items (collection), not Item. We need to find the parent Item.
            const currentTarget = this.findTarget();
            const parentCollection = currentTarget?.parent;
            // Get the parent Item by creating it from parentKey
            let parentItemInstance: any = null;
            if (!prevItem && parentCollection && parentCollection.parentKey && parentCollection.parentKey !== "root") {
                // Create the parent Item from the parentKey
                parentItemInstance = new (currentTarget!.constructor as any)(
                    currentTarget!.ydoc,
                    currentTarget!.tree,
                    parentCollection.parentKey,
                );
            }
            const hasParentToNavigateTo = !prevItem && parentItemInstance && parentItemInstance.id;

            if (prevItem || hasParentToNavigateTo) {
                // Move to previous item or parent item
                // navigateToItem("up") will handle both cases
                this.navigateToItem("up");

                // Debug information
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Moved to previous item: itemId=${this.itemId}, offset=${this.offset}`);
                }
            } else {
                // If there is no previous or parent item, move to the start of the same item
                if (this.offset > 0) {
                    this.offset = 0;
                    this.applyToStore();

                    // Ensure cursor is correctly updated
                    store.startCursorBlink();

                    // Debug information
                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                        console.log(`Moved to start of current item: offset=${this.offset}`);
                    }
                }
            }
        }
    }

    moveDown() {
        const target = this.findTarget();
        if (!target) return;

        // Debug information
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`moveDown called for itemId=${this.itemId}, offset=${this.offset}`);
        }

        // Get visual line information
        const visualLineInfo = getVisualLineInfo(this.itemId, this.offset);

        // Debug information
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`getVisualLineInfo result:`, visualLineInfo);
        }

        if (!visualLineInfo) {
            // Fallback: Logical line processing (based on newline characters)
            const text = this.getTargetText(target);
            const lines = text.split("\n");
            const currentLineIndex = getCurrentLineIndex(text, this.offset);
            if (currentLineIndex < lines.length - 1) {
                const nextLineStart = getLineStartOffset(text, currentLineIndex + 1);
                this.offset = nextLineStart;
                this.applyToStore();
                store.startCursorBlink();
            } else {
                this.navigateToItem("down");
            }
            return;
        }

        const { lineIndex, lineStartOffset, totalLines } = visualLineInfo;

        // Calculate current column position (position within visual line)
        const currentColumn = this.offset - lineStartOffset;

        // Set or update initial column position
        if (this.initialColumn === null) {
            this.initialColumn = currentColumn;
        }

        // Column position to use (initial column position)
        const targetColumn = this.initialColumn;

        // Debug information
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(
                `Visual line info: lineIndex=${lineIndex}, totalLines=${totalLines}, currentColumn=${currentColumn}, targetColumn=${targetColumn}`,
            );
        }

        if (lineIndex < totalLines - 1) {
            // Move to the visual line below within the same item
            const nextLineRange = getVisualLineOffsetRange(this.itemId, lineIndex + 1);
            if (nextLineRange) {
                const nextLineLength = nextLineRange.endOffset - nextLineRange.startOffset;
                // Move to the initial column position or the line length, whichever is shorter
                this.offset = nextLineRange.startOffset + Math.min(targetColumn, nextLineLength);
                this.applyToStore();

                // Debug information
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(
                        `Moved to next visual line in same item: offset=${this.offset}, targetColumn=${targetColumn}`,
                    );
                }

                // Start cursor blinking
                store.startCursorBlink();
            }
        } else {
            // Find the next item
            const nextItem = findNextItem(this.itemId);
            if (nextItem) {
                // Move to the first visual line of the next item
                this.navigateToItem("down");

                // Debug information
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Moved to next item: itemId=${this.itemId}, offset=${this.offset}`);
                }
            } else {
                // If there is no next item, move to the end of the same item
                const text = this.getTargetText(target);
                if (this.offset < text.length) {
                    this.offset = text.length;
                    this.applyToStore();

                    // Ensure cursor is correctly updated
                    store.startCursorBlink();

                    // Debug information
                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                        console.log(`Moved to end of current item: offset=${this.offset}`);
                    }
                }
            }
        }
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

    onInput(event: InputEvent) {
        this.editor.onInput(event);
    }

    /**
     * Handle keyboard events
     * @param event Keyboard event
     * @returns Whether the event was handled
     */
    onKeyDown(event: KeyboardEvent): boolean {
        // Debug information
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`onKeyDown called with key=${event.key}, ctrlKey=${event.ctrlKey}, shiftKey=${event.shiftKey}`);
        }

        // Check if there is a selection
        const hasSelection = this.hasSelection();
        const activeSelection = hasSelection ? this.getSelection() : undefined;

        // Debug information
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Has selection: ${hasSelection}`);
            if (activeSelection) {
                console.log(`Selections:`, [activeSelection]);
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
                    this.moveWordLeft();
                    break;
                case "ArrowRight":
                    this.moveWordRight();
                    break;
                case "ArrowUp":
                    this.scrollUp();
                    break;
                case "ArrowDown":
                    this.scrollDown();
                    break;
                case "Home":
                    this.moveToDocumentStart();
                    break;
                case "End":
                    this.moveToDocumentEnd();
                    break;
                case "PageUp":
                    this.pageUp();
                    break;
                case "PageDown":
                    this.pageDown();
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
                case "Home":
                    this.extendSelectionToLineStart();
                    break;
                case "End":
                    this.extendSelectionToLineEnd();
                    break;
                case "Enter":
                    this.insertLineBreak();
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
                default:
                    return false;
            }
        }

        // Start cursor blinking
        store.startCursorBlink();
        return true;
    }

    // Extend selection to the left
    extendSelectionLeft() {
        const target = this.findTarget();
        if (!target) return;

        // Get current selection
        const existingSelection = this.getSelectionForCurrentItem();

        let startItemId, startOffset, endItemId, endOffset, isReversed;

        if (existingSelection) {
            // Extend if there is an existing selection
            if (existingSelection.isReversed) {
                // If reversed selection, move the start position
                startItemId = existingSelection.startItemId;
                startOffset = existingSelection.startOffset;

                // Move cursor left
                const oldItemId = this.itemId;
                const oldOffset = this.offset;
                this.moveLeft();

                endItemId = this.itemId;
                endOffset = this.offset;
                isReversed = true;

                // Reverse direction if selection disappears
                if (startItemId === endItemId && startOffset === endOffset) {
                    this.itemId = oldItemId;
                    this.offset = oldOffset;
                    this.moveLeft();

                    startItemId = oldItemId;
                    startOffset = oldOffset;
                    endItemId = this.itemId;
                    endOffset = this.offset;
                    isReversed = true;
                }
            } else {
                // If forward selection, move the end position
                startItemId = existingSelection.startItemId;
                startOffset = existingSelection.startOffset;

                // Move cursor left
                this.moveLeft();

                endItemId = this.itemId;
                endOffset = this.offset;
                isReversed = false;

                // Reverse direction if selection disappears
                if (startItemId === endItemId && startOffset === endOffset) {
                    isReversed = true;
                    const temp = startItemId;
                    startItemId = endItemId;
                    endItemId = temp;

                    const tempOffset = startOffset;
                    startOffset = endOffset;
                    endOffset = tempOffset;
                }
            }
        } else {
            // Create new selection
            startItemId = this.itemId;
            startOffset = this.offset;

            // Move cursor left
            this.moveLeft();

            endItemId = this.itemId;
            endOffset = this.offset;
            isReversed = true;
        }

        // Clear existing selection for the same user before setting new range
        store.clearSelectionForUser(this.userId);
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
    }

    // Extend selection to the right
    extendSelectionRight() {
        const target = this.findTarget();
        if (!target) return;

        // Get current selection
        const existingSelection = this.getSelectionForCurrentItem();

        let startItemId, startOffset, endItemId, endOffset, isReversed;

        if (existingSelection) {
            // Extend if there is an existing selection
            if (!existingSelection.isReversed) {
                // If forward selection, move the end position
                startItemId = existingSelection.startItemId;
                startOffset = existingSelection.startOffset;

                // Move cursor right
                const oldItemId = this.itemId;
                const oldOffset = this.offset;
                this.moveRight();

                endItemId = this.itemId;
                endOffset = this.offset;
                isReversed = false;

                // Reverse direction if selection disappears
                if (startItemId === endItemId && startOffset === endOffset) {
                    this.itemId = oldItemId;
                    this.offset = oldOffset;
                    this.moveRight();

                    startItemId = oldItemId;
                    startOffset = oldOffset;
                    endItemId = this.itemId;
                    endOffset = this.offset;
                    isReversed = false;
                }
            } else {
                // If reversed selection, move the start position
                endItemId = existingSelection.endItemId;
                endOffset = existingSelection.endOffset;

                // Move cursor right
                this.moveRight();

                startItemId = this.itemId;
                startOffset = this.offset;
                isReversed = true;

                // Reverse direction if selection disappears
                if (startItemId === endItemId && startOffset === endOffset) {
                    isReversed = false;
                    const temp = startItemId;
                    startItemId = endItemId;
                    endItemId = temp;

                    const tempOffset = startOffset;
                    startOffset = endOffset;
                    endOffset = tempOffset;
                }
            }
        } else {
            // Create new selection
            startItemId = this.itemId;
            startOffset = this.offset;

            // Move cursor right
            this.moveRight();

            endItemId = this.itemId;
            endOffset = this.offset;
            isReversed = false;
        }

        // Clear existing selection for the same user before setting new range
        store.clearSelectionForUser(this.userId);
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
    }

    // Extend selection up
    extendSelectionUp(): void {
        const target = this.findTarget();
        if (!target) return;

        // Get current selection
        const existingSelection = this.getSelectionForCurrentItem();

        let startItemId, startOffset, endItemId, endOffset, isReversed;

        if (existingSelection) {
            // Extend if there is an existing selection
            if (existingSelection.isReversed) {
                // If reversed selection, move the start position
                startItemId = existingSelection.startItemId;
                startOffset = existingSelection.startOffset;

                // Move cursor up
                const oldItemId = this.itemId;
                const oldOffset = this.offset;
                this.moveUp();

                endItemId = this.itemId;
                endOffset = this.offset;
                isReversed = true;

                // Reverse direction if selection disappears
                if (startItemId === endItemId && startOffset === endOffset) {
                    this.itemId = oldItemId;
                    this.offset = oldOffset;
                    this.moveUp();

                    startItemId = this.itemId;
                    startOffset = this.offset;
                    endItemId = oldItemId;
                    endOffset = oldOffset;
                    isReversed = false;
                }
            } else {
                // If forward selection, move the end position
                endItemId = existingSelection.endItemId;
                endOffset = existingSelection.endOffset;

                // Move cursor up
                const oldItemId = this.itemId;
                const oldOffset = this.offset;
                this.moveUp();

                startItemId = this.itemId;
                startOffset = this.offset;
                isReversed = false;

                // Reverse direction if selection disappears
                if (startItemId === endItemId && startOffset === endOffset) {
                    this.itemId = oldItemId;
                    this.offset = oldOffset;
                    this.moveUp();

                    endItemId = oldItemId;
                    endOffset = oldOffset;
                    startItemId = this.itemId;
                    startOffset = this.offset;
                    isReversed = true;
                }
            }
        } else {
            // Create new selection
            startItemId = this.itemId;
            startOffset = this.offset;

            // Move cursor up
            this.moveUp();

            endItemId = this.itemId;
            endOffset = this.offset;
            isReversed = true;
        }

        // Clear existing selection for the same user before setting new range
        store.clearSelectionForUser(this.userId);
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
    }

    // Extend selection down
    extendSelectionDown() {
        const target = this.findTarget();
        if (!target) return;

        // Debug information
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`extendSelectionDown called for itemId=${this.itemId}, offset=${this.offset}`);
        }

        // Get current selection
        const existingSelection = this.getSelectionForCurrentItem();

        let startItemId, startOffset, endItemId, endOffset, isReversed;

        if (existingSelection) {
            // Extend if there is an existing selection
            if (!existingSelection.isReversed) {
                // If forward selection, move the end position
                startItemId = existingSelection.startItemId;
                startOffset = existingSelection.startOffset;

                // Move cursor down
                const oldItemId = this.itemId;
                const oldOffset = this.offset;
                this.moveDown();

                endItemId = this.itemId;
                endOffset = this.offset;
                isReversed = false;

                // Debug information
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(
                        `Extending forward selection: startItemId=${startItemId}, startOffset=${startOffset}, endItemId=${endItemId}, endOffset=${endOffset}`,
                    );
                }

                // Reverse direction if selection disappears
                if (startItemId === endItemId && startOffset === endOffset) {
                    this.itemId = oldItemId;
                    this.offset = oldOffset;
                    this.moveDown();

                    startItemId = oldItemId;
                    startOffset = oldOffset;
                    endItemId = this.itemId;
                    endOffset = this.offset;
                    isReversed = false;

                    // Debug information
                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                        console.log(
                            `Selection disappeared, reversed: startItemId=${startItemId}, startOffset=${startOffset}, endItemId=${endItemId}, endOffset=${endOffset}`,
                        );
                    }
                }
            } else {
                // If reversed selection, move the start position
                endItemId = existingSelection.endItemId;
                endOffset = existingSelection.endOffset;

                // Move cursor down
                const oldItemId = this.itemId;
                const oldOffset = this.offset;
                this.moveDown();

                startItemId = this.itemId;
                startOffset = this.offset;
                isReversed = true;

                // Debug information
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(
                        `Extending reversed selection: startItemId=${startItemId}, startOffset=${startOffset}, endItemId=${endItemId}, endOffset=${endOffset}`,
                    );
                }

                // Reverse direction if selection disappears
                if (startItemId === endItemId && startOffset === endOffset) {
                    this.itemId = oldItemId;
                    this.offset = oldOffset;
                    this.moveDown();

                    endItemId = oldItemId;
                    endOffset = oldOffset;
                    startItemId = this.itemId;
                    startOffset = this.offset;
                    isReversed = false;

                    // Debug information
                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                        console.log(
                            `Selection disappeared, reversed: startItemId=${startItemId}, startOffset=${startOffset}, endItemId=${endItemId}, endOffset=${endOffset}`,
                        );
                    }
                }
            }
        } else {
            // Create new selection
            startItemId = this.itemId;
            startOffset = this.offset;

            // Save current position
            const oldItemId = this.itemId;
            // const oldOffset = this.offset; // Not used

            // Move cursor down
            this.moveDown();

            // If moving within the same item, select all text
            if (this.itemId === oldItemId) {
                // const text = this.getTargetText(target); // Not used
                endItemId = this.itemId;
                endOffset = this.offset;
                isReversed = false;

                // Debug information
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(
                        `New selection within same item: startItemId=${startItemId}, startOffset=${startOffset}, endItemId=${endItemId}, endOffset=${endOffset}`,
                    );
                }
            } else {
                // If moved to another item
                endItemId = this.itemId;
                endOffset = this.offset; // Select up to the current position of the next item (was previously fixed to 0)
                isReversed = false;

                // Debug information
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(
                        `New selection across items: startItemId=${startItemId}, startOffset=${startOffset}, endItemId=${endItemId}, endOffset=${endOffset}`,
                    );
                }
            }
        }

        // Properly set selection direction (removed forced setting for tests)
        // Determine direction by offset if start and end are in the same item
        if (startItemId === endItemId) {
            isReversed = startOffset > endOffset;
        } // Determine direction by DOM order if items are different
        else {
            const allItems = Array.from(document.querySelectorAll("[data-item-id]")) as HTMLElement[];
            const allItemIds = allItems.map(el => el.getAttribute("data-item-id")!);
            const startIdx = allItemIds.indexOf(startItemId);
            const endIdx = allItemIds.indexOf(endItemId);

            // Default to forward direction if index is not found
            if (startIdx === -1 || endIdx === -1) {
                isReversed = false;
            } else {
                isReversed = startIdx > endIdx;
            }
        }

        // Clear existing selection for the same user before setting new range
        store.clearSelectionForUser(this.userId);
        const selectionId = store.setSelection({
            startItemId,
            startOffset,
            endItemId,
            endOffset,
            userId: this.userId,
            isReversed,
        });

        // Debug information
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Selection created with ID: ${selectionId}, isReversed=${isReversed}`);
            console.log(`Current selections:`, store.selections);
        }

        // Set selection range for global textarea
        this.updateGlobalTextareaSelection(startItemId, startOffset, endItemId, endOffset);

        // Wait a bit for DOM reflection to ensure selection is correctly created
        if (typeof window !== "undefined") {
            setTimeout(() => {
                const selectionElements = document.querySelectorAll(".editor-overlay .selection");
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Selection elements in DOM: ${selectionElements.length}`);
                }

                // Reset selection if not displayed
                if (selectionElements.length === 0) {
                    store.setSelection({
                        startItemId,
                        startOffset,
                        endItemId,
                        endOffset,
                        userId: this.userId,
                        isReversed,
                    });

                    // Force update selection display
                    store.forceUpdate();
                }
            }, 150); // Increase timeout to 150ms to allow more time for DOM updates
        }
    }

    // Move cursor to the start of the line
    moveToLineStart() {
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

        // Debug information
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`extendSelectionToLineStart called for itemId=${this.itemId}, offset=${this.offset}`);
        }

        // Get current selection
        const existingSelection = this.getSelectionForCurrentItem();

        let startItemId, startOffset, endItemId, endOffset, isReversed;
        const text = this.getTargetText(target);
        const currentLineIndex = getCurrentLineIndex(text, this.offset);
        const lineStartOffset = getLineStartOffset(text, currentLineIndex);

        // Debug information
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(
                `Current line index: ${currentLineIndex}, lineStartOffset: ${lineStartOffset}, text: "${text}"`,
            );
        }

        // Do nothing if current cursor position is already at line start
        if (this.offset === lineStartOffset && !existingSelection) {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Already at line start, no selection created`);
            }
            return;
        }

        if (existingSelection) {
            // Extend if there is an existing selection
            if (existingSelection.isReversed) {
                // If reversed selection, move the start position
                startItemId = existingSelection.startItemId;
                startOffset = existingSelection.startOffset;

                // Move cursor to line start
                endItemId = this.itemId;
                endOffset = lineStartOffset;
                isReversed = true;
            } else {
                // If forward selection, move the end position
                endItemId = existingSelection.endItemId;
                endOffset = existingSelection.endOffset;

                // Move cursor to line start
                startItemId = this.itemId;
                startOffset = lineStartOffset;
                isReversed = false;
            }
        } else {
            // Create new selection
            // Select from current position to line start
            startItemId = this.itemId;
            endItemId = this.itemId;

            // Determine direction based on relationship between current position and line start
            if (this.offset > lineStartOffset) {
                // Normal case (cursor is in the middle of the line)
                startOffset = this.offset;
                endOffset = lineStartOffset;
                isReversed = true; // Reverse direction as we are selecting towards line start
            } else {
                // If cursor is at line start (usually doesn't reach here)
                startOffset = lineStartOffset;
                endOffset = this.offset;
                isReversed = false;
            }
        }

        // Debug information
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(
                `Setting selection: startItemId=${startItemId}, startOffset=${startOffset}, endItemId=${endItemId}, endOffset=${endOffset}, isReversed=${isReversed}`,
            );
        }

        // Clear existing selection for the same user before setting new range
        store.clearSelectionForUser(this.userId);
        // Set selection
        store.setSelection({
            startItemId,
            startOffset,
            endItemId,
            endOffset,
            userId: this.userId,
            isReversed,
        });

        // Move cursor position to line start
        this.offset = lineStartOffset;
        this.applyToStore();

        // Set selection range for global textarea
        this.updateGlobalTextareaSelection(startItemId, startOffset, endItemId, endOffset);
    }

    // Extend selection to the end of the line
    extendSelectionToLineEnd() {
        const target = this.findTarget();
        if (!target) return;

        // Debug information
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`extendSelectionToLineEnd called for itemId=${this.itemId}, offset=${this.offset}`);
        }

        // Get current selection
        const existingSelection = this.getSelectionForCurrentItem();

        let startItemId, startOffset, endItemId, endOffset, isReversed;
        const text = this.getTargetText(target);
        const currentLineIndex = getCurrentLineIndex(text, this.offset);
        const lineEndOffset = getLineEndOffset(text, currentLineIndex);

        // Debug information
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Current line index: ${currentLineIndex}, lineEndOffset: ${lineEndOffset}, text: "${text}"`);
        }

        // Do nothing if current cursor position is already at line end
        if (this.offset === lineEndOffset && !existingSelection) {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Already at line end, no selection created`);
            }
            return;
        }

        if (existingSelection) {
            // Extend if there is an existing selection
            if (!existingSelection.isReversed) {
                // If forward selection, move the end position
                startItemId = existingSelection.startItemId;
                startOffset = existingSelection.startOffset;

                // Move cursor to line end
                endItemId = this.itemId;
                endOffset = lineEndOffset;
                isReversed = false;
            } else {
                // If reversed selection, move the start position
                endItemId = existingSelection.endItemId;
                endOffset = existingSelection.endOffset;

                // Move cursor to line end
                startItemId = this.itemId;
                startOffset = lineEndOffset;
                isReversed = true;
            }
        } else {
            // Create new selection
            startItemId = this.itemId;
            startOffset = this.offset;

            // Select up to line end
            endItemId = this.itemId;
            endOffset = lineEndOffset;
            isReversed = this.offset > lineEndOffset;
        }

        // Debug information
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(
                `Setting selection: startItemId=${startItemId}, startOffset=${startOffset}, endItemId=${endItemId}, endOffset=${endOffset}, isReversed=${isReversed}`,
            );
        }

        // Clear existing selection for the same user before setting new range
        store.clearSelectionForUser(this.userId);
        // Set selection
        const selectionId = store.setSelection({
            startItemId,
            startOffset,
            endItemId,
            endOffset,
            userId: this.userId,
            isReversed,
        });

        // Debug information
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Selection created with ID: ${selectionId}`);
            console.log(`Current selections:`, store.selections);
        }

        // Move cursor position to line end
        this.offset = lineEndOffset;
        this.applyToStore();

        // Set selection range for global textarea
        this.updateGlobalTextareaSelection(startItemId, startOffset, endItemId, endOffset);

        // Wait a bit for DOM reflection to ensure selection is correctly created
        if (typeof window !== "undefined") {
            setTimeout(() => {
                const selectionElements = document.querySelectorAll(".editor-overlay .selection");
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Selection elements in DOM: ${selectionElements.length}`);
                }

                // Reset selection if not displayed
                if (selectionElements.length === 0) {
                    store.setSelection({
                        startItemId,
                        startOffset,
                        endItemId,
                        endOffset,
                        userId: this.userId,
                        isReversed,
                    });

                    // Force update selection display
                    store.forceUpdate();
                }
            }, 100); // Increase timeout to 100ms to allow more time for DOM updates

            // Additional check and update
            setTimeout(() => {
                const selectionElements = document.querySelectorAll(".editor-overlay .selection");
                if (selectionElements.length === 0) {
                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                        console.log(`Selection still not visible after 100ms, forcing update again`);
                    }

                    // Reset selection
                    store.setSelection({
                        startItemId,
                        startOffset,
                        endItemId,
                        endOffset,
                        userId: this.userId,
                        isReversed,
                    });

                    // Force update
                    store.forceUpdate();
                }
            }, 200);
        }
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
        const root = generalStore.currentPage;
        if (!root) return;
        let item: Item = root;
        while (item.items && (item.items as Iterable<Item>)[Symbol.iterator]) {
            const iter = (item.items as Iterable<Item>)[Symbol.iterator]();
            const first = iter.next();
            if (first.done) break;
            item = first.value;
        }
        this.itemId = item.id;
        this.offset = 0;
        this.applyToStore();
        store.startCursorBlink();
    }

    // Move to document end
    moveToDocumentEnd() {
        const root = generalStore.currentPage;
        if (!root) return;
        let item: Item = root;
        while (item.items && (item.items as Iterable<Item>)[Symbol.iterator]) {
            let last: Item | undefined;
            for (const child of item.items as Iterable<Item>) {
                last = child;
            }
            if (!last) break;
            item = last;
        }
        this.itemId = item.id;
        this.offset = (item.text || "").length;
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

    // Formatting methods are defined below

    /**
     * Select all text in the current item
     */
    selectAll() {
        const target = this.findTarget();
        if (!target) return;

        const text = this.getTargetText(target);

        // Set selection
        store.setSelection({
            startItemId: this.itemId,
            startOffset: 0,
            endItemId: this.itemId,
            endOffset: text.length,
            userId: this.userId,
            isReversed: false,
        });

        // Set selection range for global textarea
        this.updateGlobalTextareaSelection(this.itemId, 0, this.itemId, text.length);

        // Set cursor position to the end
        this.offset = text.length;
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
        this.applyToStore();
        this.clearSelection();
        this.updateGlobalTextareaSelection(this.itemId, newOffset, this.itemId, newOffset);
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
     * Navigate between items
     * @param direction Direction of movement
     */
    private navigateToItem(direction: "left" | "right" | "up" | "down") {
        // Debug information
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(
                `navigateToItem called with direction=${direction}, itemId=${this.itemId}, offset=${this.offset}`,
            );
        }

        // Navigation to prev/next items only updates store; event emission is handled by component
        const oldItemId = this.itemId;
        let newItemId = this.itemId; // Default is current item
        let newOffset = this.offset; // Default is current offset
        let itemChanged = false;

        // Get text of current item
        const currentTarget = this.findTarget();
        const currentText = this.getTargetText(currentTarget);
        const currentColumn = getCurrentColumn(currentText, this.offset);

        // Debug information
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Current column: ${currentColumn}, current text: "${currentText}"`);
        }

        // Handle item navigation
        if (direction === "left") {
            let prevItem = findPreviousItem(this.itemId);

            // DOM fallback: when tree lookup fails (e.g., first child under page title),
            // try to use the visual order to locate the previous item.
            if (!prevItem && typeof document !== "undefined") {
                const currentEl = document.querySelector(`[data-item-id="${this.itemId}"]`);
                if (currentEl) {
                    const allItems = Array.from(document.querySelectorAll("[data-item-id]"));
                    const currentIndex = allItems.indexOf(currentEl);
                    if (currentIndex > 0) {
                        // Walk backwards until we find a previous element that is not an ancestor
                        // of the current element. Moving to an ancestor would incorrectly jump
                        // to the parent item when the current item has no previous sibling.
                        let prevEl: HTMLElement | undefined;
                        for (let i = currentIndex - 1; i >= 0; i--) {
                            const candidate = allItems[i] as HTMLElement;
                            if (candidate.contains(currentEl)) {
                                continue;
                            }
                            prevEl = candidate;
                            break;
                        }
                        if (prevEl) {
                            const prevItemId = prevEl.getAttribute("data-item-id");
                            if (prevItemId && prevItemId !== this.itemId) {
                                prevItem = searchItem(generalStore.currentPage as any, prevItemId);
                                newItemId = prevItemId;
                                const treeTextLength = prevItem
                                    ? this.getTargetText(prevItem as any).length
                                    : undefined;
                                const domTextLength = prevEl.querySelector(".item-text")?.textContent?.length
                                    ?? prevEl.textContent?.length
                                    ?? 0;
                                newOffset = treeTextLength ?? domTextLength ?? 0;
                                itemChanged = true;
                            }
                        }
                    }
                }
            }

            if (prevItem && !itemChanged) {
                newItemId = prevItem.id;
                newOffset = prevItem.text?.length || 0;
                itemChanged = true;

                // Debug information
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Moving left to previous item: id=${prevItem.id}, offset=${newOffset}`);
                }
            } else if (!itemChanged) {
                // If no previous item, move to the start of the same item
                const target = this.findTarget();
                if (target) {
                    newOffset = 0;

                    // Debug information
                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                        console.log(`No previous item, moving to start of current item: offset=${newOffset}`);
                    }
                }
            }
        } else if (direction === "right") {
            // Check if we're at the end of the current item
            const target = this.findTarget();
            const text = target ? this.getTargetText(target) : "";
            const atEndOfCurrentItem = this.offset >= text.length;

            let nextItem = findNextItem(this.itemId);

            // If findNextItem failed, try to find the next item via DOM traversal as a fallback
            if (!nextItem) {
                nextItem = this.findNextItemViaDOM(this.itemId);
            }

            // If we're at the end of the current item and still don't have a next item,
            // try additional DOM-based approaches with broader selectors
            if (atEndOfCurrentItem && !nextItem) {
                // Try to get all potential item elements, with a broader selector
                const allItemElements = Array.from(
                    document.querySelectorAll(
                        ".outliner-item[data-item-id], [data-item-id].outliner-item, [data-item-id]",
                    ),
                ) as HTMLElement[];

                let currentIndex = -1;
                for (let i = 0; i < allItemElements.length; i++) {
                    if (allItemElements[i].getAttribute("data-item-id") === this.itemId) {
                        currentIndex = i;
                        break;
                    }
                }

                if (currentIndex !== -1 && currentIndex < allItemElements.length - 1) {
                    const nextItemElement = allItemElements[currentIndex + 1];
                    const nextItemId = nextItemElement.getAttribute("data-item-id");

                    if (nextItemId) {
                        // Try to find this item in the Yjs tree
                        const root = generalStore.currentPage as any;
                        if (root) {
                            nextItem = searchItem(root, nextItemId);
                        }
                    }
                }
            }

            if (nextItem) {
                newItemId = nextItem.id;
                newOffset = 0;
                itemChanged = true;

                // Debug information
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Moving right to next item: id=${nextItem.id}, offset=${newOffset}`);
                }
            } else if (atEndOfCurrentItem) {
                // DOM-based approach to find the next item by looking for visually adjacent elements
                try {
                    // Most direct approach: Find the element with the current item ID and get its next sibling
                    const currentItemElement = document.querySelector(`[data-item-id="${this.itemId}"]`);

                    if (currentItemElement) {
                        // First try to get the immediate next sibling
                        let nextItemElement: Element | null = currentItemElement.nextElementSibling;

                        // If no immediate sibling, traverse up and try again
                        let parentElement: Element | null = currentItemElement.parentElement;
                        while (!nextItemElement && parentElement) {
                            nextItemElement = parentElement.nextElementSibling;
                            if (!nextItemElement) {
                                parentElement = parentElement.parentElement;
                            }
                        }

                        // If still no next element found, use querySelector to get elements after current one
                        if (!nextItemElement) {
                            const allItems = Array.from(document.querySelectorAll("[data-item-id]"));
                            const currentIndex = allItems.indexOf(currentItemElement);
                            if (currentIndex !== -1 && currentIndex < allItems.length - 1) {
                                nextItemElement = allItems[currentIndex + 1];
                            }
                        }

                        // Try to get the ID from the found element
                        if (nextItemElement) {
                            let nextItemId = nextItemElement.getAttribute("data-item-id");

                            // If not found directly, try to find a child element that has the ID
                            if (!nextItemId) {
                                const childWithId = nextItemElement.querySelector("[data-item-id]");
                                if (childWithId) {
                                    nextItemId = childWithId.getAttribute("data-item-id");
                                }
                            }

                            if (nextItemId && nextItemId !== this.itemId) {
                                // Directly use the found next item ID
                                newItemId = nextItemId;
                                newOffset = 0; // Start at the beginning of the next item
                                itemChanged = true;

                                // Debug information
                                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                                    console.log(
                                        `Moving right to next item (DOM direct lookup): id=${nextItemId}, offset=${newOffset}`,
                                    );
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error("Error in DOM-based next item lookup:", e);
                }

                // If still not found, try a different approach by using a depth-first traversal of the tree
                if (!itemChanged) {
                    const root = generalStore.currentPage as any;
                    if (root) {
                        const allItemIds = this.collectAllItemIds(root, []);
                        const currentIndex = allItemIds.indexOf(this.itemId);
                        if (currentIndex !== -1 && currentIndex < allItemIds.length - 1) {
                            const nextItemId = allItemIds[currentIndex + 1];
                            const nextItemFromTree = searchItem(root, nextItemId);
                            if (nextItemFromTree) {
                                newItemId = nextItemId;
                                newOffset = 0;
                                itemChanged = true;

                                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                                    console.log(
                                        `Moving right to next item (tree fallback): id=${nextItemId}, offset=${newOffset}`,
                                    );
                                }
                            }
                        }
                    }
                }

                // FINAL ULTIMATE FALLBACK: If we still haven't found the next item,
                // let's try to get all items from the current page and find the next one in sequence
                if (!itemChanged) {
                    try {
                        const root = generalStore.currentPage as any;
                        if (root) {
                            // Try a depth-first search to collect all items in proper order
                            const allItemsList: string[] = this.collectAllItemIds(root, []);

                            // Find current index and get the next item
                            const currentIndex = allItemsList.indexOf(this.itemId);
                            if (currentIndex !== -1 && currentIndex < allItemsList.length - 1) {
                                const nextItemId = allItemsList[currentIndex + 1];
                                newItemId = nextItemId;
                                newOffset = 0;
                                itemChanged = true;

                                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                                    console.log(
                                        `Moving right to next item (breadth-first fallback): id=${nextItemId}, offset=${newOffset}`,
                                    );
                                }
                            }
                        }
                    } catch (e) {
                        console.error("Error in ultimate fallback:", e);
                    }
                }

                // ABSOLUTE LAST RESORT: If itemChanged is still false after all attempts,
                // try to get all items from the DOM directly and move to the visually next one
                if (!itemChanged) {
                    try {
                        // Get all elements with data-item-id attributes
                        const allElements = Array.from(document.querySelectorAll("[data-item-id]"));

                        // Find the current item's index
                        const currentElement = document.querySelector(`[data-item-id="${this.itemId}"]`);
                        if (currentElement) {
                            const currentIndex = allElements.indexOf(currentElement);
                            if (currentIndex !== -1 && currentIndex < allElements.length - 1) {
                                // Get the next element in the DOM
                                const nextElement = allElements[currentIndex + 1] as HTMLElement;
                                const nextItemId = nextElement.getAttribute("data-item-id");

                                if (nextItemId && nextItemId !== this.itemId) {
                                    newItemId = nextItemId;
                                    newOffset = 0;
                                    itemChanged = true;

                                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                                        console.log(
                                            `Moving right to next item (last resort DOM): id=${nextItemId}, offset=${newOffset}`,
                                        );
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        console.error("Error in last resort DOM approach:", e);
                    }
                }

                // If itemChanged is still false after ALL attempts, we're at the end but couldn't find a next item
                // In this case, we should remain at the end of the current item, but still trigger the update
                if (!itemChanged) {
                    // Stay at the end of the current item but ensure we update the cursor state
                    // This case occurs when there is no next item available
                    newOffset = text.length;
                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                        console.log(
                            `No next item found after all attempts. Staying at end of current item: offset=${newOffset}`,
                        );
                    }
                }
            } else {
                // If we're not at the end of an item, just stay in the same item at end position
                const target = this.findTarget();
                if (target) {
                    newOffset = this.getTargetText(target).length;

                    // Debug information
                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                        console.log(`No next item, moving to end of current item: offset=${newOffset}`);
                    }
                }
            }
        } else if (direction === "up") {
            let prevItem = findPreviousItem(this.itemId);
            // If no previous sibling, try to navigate to parent item for up direction
            // Note: item.parent returns Items (collection), not Item. We need to find the parent Item.
            if (!prevItem) {
                const currentTarget = this.findTarget();
                const parentCollection = currentTarget?.parent;
                // Get the parent Item by creating it from parentKey (skip "root" as it's the project level)
                if (parentCollection && parentCollection.parentKey && parentCollection.parentKey !== "root") {
                    prevItem = new (currentTarget!.constructor as any)(
                        currentTarget!.ydoc,
                        currentTarget!.tree,
                        parentCollection.parentKey,
                    );
                }
            }
            if (prevItem) {
                newItemId = prevItem.id;
                const prevText = this.getTargetText(prevItem as any);
                const visualLineInfo = getVisualLineInfo(prevItem.id, prevText.length > 0 ? prevText.length - 1 : 0);
                let lastLineIndex: number | undefined;
                let lastLineStart: number | undefined;
                let lastLineLength: number | undefined;
                let targetColumn: number | undefined;

                if (visualLineInfo && visualLineInfo.totalLines > 0) {
                    lastLineIndex = visualLineInfo.totalLines - 1;
                    const lastLineRange = getVisualLineOffsetRange(prevItem.id, lastLineIndex);
                    if (lastLineRange) {
                        lastLineStart = lastLineRange.startOffset;
                        lastLineLength = lastLineRange.endOffset - lastLineRange.startOffset;

                        let desiredColumn = this.initialColumn !== null ? this.initialColumn : currentColumn;
                        if (this.offset === 0) {
                            desiredColumn = 0;
                        }

                        targetColumn = Math.min(desiredColumn, lastLineLength);
                        newOffset = lastLineStart + targetColumn;
                    } else {
                        newOffset = prevText.length;
                    }
                } else {
                    newOffset = prevText.length;
                }

                itemChanged = true;

                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(
                        `Moving up to previous item's last line: id=${prevItem.id}, lastLineIndex=${lastLineIndex}, lastLineStart=${lastLineStart}, lastLineLength=${lastLineLength}, newOffset=${newOffset}, currentColumn=${currentColumn}, targetColumn=${targetColumn}`,
                    );
                }
            } else {
                // If no previous item, move to the start of the same item
                newOffset = 0;

                // Debug information
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`No previous item, moving to start of current item: offset=${newOffset}`);
                }
            }
        } else if (direction === "down") {
            let nextItem = findNextItem(this.itemId);

            // If findNextItem failed, try to find the next item via DOM traversal as a fallback
            if (!nextItem) {
                nextItem = this.findNextItemViaDOM(this.itemId);
            }

            if (nextItem) {
                newItemId = nextItem.id;
                const nextText = this.getTargetText(nextItem as any);
                // const nextLines = nextText.split("\n"); // Not used
                const firstLineIndex = 0;
                const firstLineStart = getLineStartOffset(nextText, firstLineIndex);
                const firstLineEnd = getLineEndOffset(nextText, firstLineIndex);
                const firstLineLength = firstLineEnd - firstLineStart;

                // Calculate position with minimal x-coordinate change
                // Select position closest to initial or current column position
                // Ensure it does not exceed the length of the next item's first line
                const targetColumn = Math.min(
                    this.initialColumn !== null ? this.initialColumn : currentColumn,
                    firstLineLength,
                );
                newOffset = firstLineStart + targetColumn;

                // Special case: If current cursor is at the end of the line (offset is text length),
                // move to the end of the next item's first line
                const currentTarget = this.findTarget();
                const currentText = this.getTargetText(currentTarget);
                if (this.offset === currentText.length) {
                    newOffset = firstLineEnd;
                }

                itemChanged = true;

                // Debug information
                console.log(
                    `navigateToItem down - Moving to next item's first line: itemId=${nextItem.id}, offset=${newOffset}, targetColumn=${targetColumn}, firstLineStart=${firstLineStart}, firstLineLength=${firstLineLength}`,
                );
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(
                        `Moving down to next item's first line: id=${nextItem.id}, firstLineIndex=${firstLineIndex}, firstLineStart=${firstLineStart}, firstLineLength=${firstLineLength}, newOffset=${newOffset}, currentColumn=${currentColumn}`,
                    );
                }
            } else {
                // If there is no next item, move to the end of the same item
                const target = this.findTarget();
                if (target) {
                    newOffset = this.getTargetText(target).length;

                    // Debug information
                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                        console.log(`No next item, moving to end of current item: offset=${newOffset}`);
                    }
                }
            }
        }

        // Execute only if the item has changed
        if (itemChanged) {
            // Debug information
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Item changed: oldItemId=${oldItemId}, newItemId=${newItemId}, newOffset=${newOffset}`);
            }

            // Ensure old item's cursor is removed before moving
            store.clearCursorForItem(oldItemId);

            // Remove other cursors for the same user (maintain single cursor mode)
            // Note: Clear only cursors for the same user, not all cursors
            const cursorEntries = store.cursors ? Object.values(store.cursors) : [];
            const cursorsToRemove = cursorEntries
                .filter(c => c.userId === this.userId && c.cursorId !== this.cursorId)
                .map(c => c.cursorId);

            // Debug information
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Removing cursors: ${cursorsToRemove.join(", ")}`);
            }

            // Clear selection
            store.clearSelectionForUser(this.userId);

            // Remove existing cursors in the target item (prevent duplication)
            // Note: Remove only cursors for the same user
            const cursorsInTargetItem = cursorEntries
                .filter(c => c.itemId === newItemId && c.userId === this.userId)
                .map(c => c.cursorId);

            // Debug information
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Removing cursors in target item: ${cursorsInTargetItem.join(", ")}`);
            }

            // Set new item and offset
            this.itemId = newItemId;
            this.offset = newOffset;

            // Update active item
            store.setActiveItem(this.itemId);

            // Create new cursor
            const cursorId = store.setCursor({
                itemId: this.itemId,
                offset: this.offset,
                isActive: true,
                userId: this.userId,
            });

            // Update cursorId
            this.cursorId = cursorId;

            // Start cursor blinking
            store.startCursorBlink();

            // Dispatch custom event
            if (typeof document !== "undefined") {
                const event = new CustomEvent("navigate-to-item", {
                    bubbles: true,
                    detail: {
                        direction,
                        fromItemId: oldItemId,
                        toItemId: this.itemId,
                        cursorScreenX: 0, // Cursor X coordinate (set to 0 during item navigation)
                    },
                });
                document.dispatchEvent(event);
            }
        } else {
            // Update cursor state even if item did not change
            this.offset = newOffset;
            this.applyToStore();
            store.startCursorBlink();

            // Debug information
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Item not changed, updated offset: ${newOffset}`);
            }
        }
    }

    /**
     * Set selection range for global textarea
     * @param startItemId Start item ID
     * @param startOffset Start offset
     * @param endItemId End item ID
     * @param endOffset End offset
     */
    updateGlobalTextareaSelection(startItemId: string, startOffset: number, endItemId: string, endOffset: number) {
        // Get global textarea
        const textarea = document.querySelector(".global-textarea") as HTMLTextAreaElement;
        if (!textarea) return;

        // Get text of items
        const startItemEl = document.querySelector(`[data-item-id="${startItemId}"] .item-text`) as HTMLElement;
        const endItemEl = document.querySelector(`[data-item-id="${endItemId}"] .item-text`) as HTMLElement;

        if (!startItemEl || !endItemEl) return;

        const startItemText = startItemEl.textContent || "";
        // const endItemText = endItemEl.textContent || ""; // Not used

        // If the selection is within a single item
        if (startItemId === endItemId) {
            // Update textarea content
            textarea.value = startItemText;

            // Set selection
            textarea.setSelectionRange(startOffset, endOffset);
        } else {
            // If the selection spans multiple items
            // Get all items
            const allItems = Array.from(document.querySelectorAll("[data-item-id]")) as HTMLElement[];
            const allItemIds = allItems.map(el => el.getAttribute("data-item-id")!);

            // Get indices of start and end items
            const startIdx = allItemIds.indexOf(startItemId);
            const endIdx = allItemIds.indexOf(endItemId);

            if (startIdx === -1 || endIdx === -1) return;

            // Normalize start and end indices
            const firstIdx = Math.min(startIdx, endIdx);
            const lastIdx = Math.max(startIdx, endIdx);

            // Concatenate text of items within selection
            let combinedText = "";
            for (let i = firstIdx; i <= lastIdx; i++) {
                const itemId = allItemIds[i];
                const itemEl = document.querySelector(`[data-item-id="${itemId}"] .item-text`) as HTMLElement;
                if (itemEl) {
                    combinedText += itemEl.textContent || "";
                    if (i < lastIdx) combinedText += "\n";
                }
            }

            // Update textarea content
            textarea.value = combinedText;

            // Calculate start and end positions of selection
            let selectionStart = 0;
            let selectionEnd = 0;

            // Calculate text length from start item to start position
            if (startIdx === firstIdx) {
                selectionStart = startOffset;
            } else {
                // If start item is after end item (reverse selection)
                let textBeforeStart = 0;
                for (let i = firstIdx; i < startIdx; i++) {
                    const itemId = allItemIds[i];
                    const itemEl = document.querySelector(`[data-item-id="${itemId}"] .item-text`) as HTMLElement;
                    if (itemEl) {
                        textBeforeStart += (itemEl.textContent || "").length + 1; // +1 for newline
                    }
                }
                selectionStart = textBeforeStart + startOffset;
            }

            // Calculate text length from end item to end position
            if (endIdx === lastIdx) {
                let textBeforeEnd = 0;
                for (let i = firstIdx; i < endIdx; i++) {
                    const itemId = allItemIds[i];
                    const itemEl = document.querySelector(`[data-item-id="${itemId}"] .item-text`) as HTMLElement;
                    if (itemEl) {
                        textBeforeEnd += (itemEl.textContent || "").length + 1; // +1 for newline
                    }
                }
                selectionEnd = textBeforeEnd + endOffset;
            } else {
                // If end item is before start item (reverse selection)
                selectionEnd = endOffset;
            }

            // Set selection
            textarea.setSelectionRange(selectionStart, selectionEnd);
        }
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

    /**
     * Common method to apply format to selection
     * @param markdownPrefix Markdown format prefix
     * @param markdownSuffix Markdown format suffix
     * @param scrapboxPrefix Scrapbox format prefix
     * @param scrapboxSuffix Scrapbox format suffix
     */

    /**
     * Apply Scrapbox syntax format to selection
     * @param formatType Type of format('bold', 'italic', 'strikethrough', 'underline', 'code')
     */

    /**
     * Apply format to selection spanning multiple items
     */

    /**
     * Apply Scrapbox syntax format to selection spanning multiple items
     */

    /**
     * Find the next item using DOM traversal as a fallback mechanism
     * @param currentItemId The ID of the current item
     * @returns The next item if found, otherwise undefined
     */
    private findNextItemViaDOM(currentItemId: string): any | undefined {
        if (typeof document === "undefined") return undefined;

        // Find the current element in the DOM
        const currentEl = document.querySelector(`[data-item-id="${currentItemId}"]`) as HTMLElement;
        if (!currentEl) return undefined;

        // Try to find the next element with data-item-id attribute
        // Look for the next sibling first
        let nextEl: HTMLElement | null = currentEl.nextElementSibling as HTMLElement;

        // If no direct sibling, try to find next item in the DOM tree
        let searchEl = currentEl;
        while (!nextEl && searchEl.parentElement) {
            nextEl = searchEl.parentElement.nextElementSibling as HTMLElement;
            if (!nextEl) {
                searchEl = searchEl.parentElement;
            }
        }

        // If no sibling at current level, try to find next item among descendants
        if (!nextEl) {
            // Look for next item in the subtree
            const allItems = document.querySelectorAll("[data-item-id]") as NodeListOf<HTMLElement>;
            let foundCurrent = false;

            for (let i = 0; i < allItems.length; i++) {
                if (foundCurrent) {
                    nextEl = allItems[i];
                    break;
                }
                if (allItems[i].getAttribute("data-item-id") === currentItemId) {
                    foundCurrent = true;
                }
            }
        }

        if (nextEl) {
            const nextItemId = nextEl.getAttribute("data-item-id");

            // Since we can't directly access the Item objects from the DOM,
            // we need to find it in the Yjs tree
            if (nextItemId) {
                const root = generalStore.currentPage as any;
                if (root) {
                    const found = searchItem(root, nextItemId);
                    if (found) return found;
                }
            }
        }

        return undefined;
    }

    /**
     * Collect all item IDs from the tree in traversal order
     * @param node The starting node to collect from
     * @param ids Array to collect IDs into
     * @returns Array of item IDs in tree traversal order
     */
    private collectAllItemIds(node: any, ids: string[]): string[] {
        if (node.id) {
            ids.push(node.id);
        }

        // Check if node has items that are iterable
        if (node.items && typeof (node.items as any)[Symbol.iterator] === "function") {
            for (const child of node.items as Iterable<any>) {
                this.collectAllItemIds(child, ids);
            }
        }

        return ids;
    }
}
// test 1760075045
