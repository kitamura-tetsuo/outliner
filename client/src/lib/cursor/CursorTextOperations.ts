import type { Item } from "../../schema/yjs-schema";
import { editorOverlayStore as store } from "../../stores/EditorOverlayStore.svelte";
// import { store as generalStore } from "../../stores/store.svelte"; // Not used

// Define a generic cursor interface that we expect
interface Cursor {
    itemId: string;
    offset: number;
    userId: string;
    resetInitialColumn(): void;
    findTarget(): Item | null;
    findPreviousItem(): Item | null;
    findNextItem(): Item | null;
    clearSelection(): void;
    deleteMultiItemSelection(selection: any): void; // This will need to be properly typed too
    applyToStore(): void;
    // Add other required methods as needed
}

export class CursorTextOperations {
    private cursor: Cursor; // Hold Cursor class instance

    constructor(cursor: Cursor) {
        this.cursor = cursor;
    }

    /**
     * Insert text
     * @param ch Text to insert
     */
    insertText(ch: string) {
        // Reset initial column position since this is not an up/down key operation
        this.cursor.resetInitialColumn();

        const node = this.cursor.findTarget();
        if (!node) {
            console.error(`insertText: Target item not found for itemId: ${this.cursor.itemId}`);
            return;
        }

        const currentText = node.text?.toString?.() ?? "";
        console.log(`insertText: Inserting "${ch}" at offset ${this.cursor.offset} in item ${this.cursor.itemId}`);
        console.log(`insertText: Current text: "${currentText}"`);

        // If there is a selection, delete it before inserting text
        const selection = Object.values(store.selections).find(s =>
            s.userId === this.cursor.userId
            && s.startItemId === this.cursor.itemId
            && s.endItemId === this.cursor.itemId
        );

        if (selection && selection.startOffset !== selection.endOffset) {
            // Delete text in selection
            const startOffset = Math.min(selection.startOffset, selection.endOffset);
            const endOffset = Math.max(selection.startOffset, selection.endOffset);
            const txt = currentText.slice(0, startOffset) + ch + currentText.slice(endOffset);
            node.updateText(txt);

            // Update cursor position
            this.cursor.offset = startOffset + ch.length;

            // Clear selection
            this.cursor.clearSelection();

            console.log(`insertText: Updated text with selection: "${node.text?.toString?.() ?? ""}"`);
        } else {
            // Normal insertion
            const txt = currentText.slice(0, this.cursor.offset) + ch + currentText.slice(this.cursor.offset);
            node.updateText(txt);
            this.cursor.offset += ch.length;

            console.log(`insertText: Updated text: "${node.text?.toString?.() ?? ""}"`);
        }

        this.cursor.applyToStore();

        // Call onEdit callback
        store.triggerOnEdit();

        // Note: Do not sync global textarea value
        // In multi-cursor environment, multiple items may be edited simultaneously,
        // setting specific item value to single textarea is not appropriate
    }

    /**
     * Delete character before cursor
     */
    deleteBackward() {
        // Reset initial column position since this is not an up/down key operation
        this.cursor.resetInitialColumn();

        const node = this.cursor.findTarget();
        if (!node) return;

        // If there is a selection, delete it
        const selection = Object.values(store.selections).find(s => s.userId === this.cursor.userId);

        if (selection && selection.startOffset !== selection.endOffset) {
            // If selection spans multiple items
            if (selection.startItemId !== selection.endItemId) {
                this.cursor.deleteMultiItemSelection(selection);
                return;
            }

            // If selection is within a single item
            if (selection.startItemId === this.cursor.itemId && selection.endItemId === this.cursor.itemId) {
                // Delete text in selection
                const startOffset = Math.min(selection.startOffset, selection.endOffset);
                const endOffset = Math.max(selection.startOffset, selection.endOffset);
                const txt = node.text?.toString?.() ?? "";
                const newTxt = txt.slice(0, startOffset) + txt.slice(endOffset);
                node.updateText(newTxt);

                // Update cursor position
                this.cursor.offset = startOffset;

                // Clear selection
                this.cursor.clearSelection();
            }
        } else {
            // Normal deletion
            if (this.cursor.offset > 0) {
                const txt = node.text?.toString?.() ?? "";
                const pos = this.cursor.offset - 1;
                const newTxt = txt.slice(0, pos) + txt.slice(pos + 1);
                node.updateText(newTxt);
                this.cursor.offset = Math.max(0, this.cursor.offset - 1);
            } else {
                // Merge with previous item at start of line
                this.mergeWithPreviousItem();
            }
        }

        this.cursor.applyToStore();

        // Call onEdit callback
        store.triggerOnEdit();

        // Note: Do not sync global textarea value
        // In multi-cursor environment, multiple items may be edited simultaneously,
        // setting specific item value to single textarea is not appropriate
    }

    /**
     * Delete character after cursor
     */
    deleteForward() {
        // Reset initial column position since this is not an up/down key operation
        this.cursor.resetInitialColumn();

        const node = this.cursor.findTarget();
        if (!node) return;

        // If there is a selection, delete it
        const selection = Object.values(store.selections).find(s => s.userId === this.cursor.userId);

        if (selection && selection.startOffset !== selection.endOffset) {
            // If selection spans multiple items
            if (selection.startItemId !== selection.endItemId) {
                this.cursor.deleteMultiItemSelection(selection);
                return;
            }

            // If selection is within a single item
            if (selection.startItemId === this.cursor.itemId && selection.endItemId === this.cursor.itemId) {
                // Delete text in selection
                const startOffset = Math.min(selection.startOffset, selection.endOffset);
                const endOffset = Math.max(selection.startOffset, selection.endOffset);
                const txtSel = node.text?.toString?.() ?? "";
                const newTxtSel = txtSel.slice(0, startOffset) + txtSel.slice(endOffset);
                node.updateText(newTxtSel);

                // Update cursor position
                this.cursor.offset = startOffset;

                // Clear selection
                this.cursor.clearSelection();
            }
        } else {
            // Normal deletion
            const txt = node.text?.toString?.() ?? "";
            if (this.cursor.offset < txt.length) {
                const newTxt = txt.slice(0, this.cursor.offset) + txt.slice(this.cursor.offset + 1);
                node.updateText(newTxt);
            } else {
                // If at end of line
                // Delete item itself if it is empty
                if (txt.length === 0) {
                    this.deleteEmptyItem();
                    return;
                }
                // Merge with next item if not empty
                this.mergeWithNextItem();
            }
        }

        this.cursor.applyToStore();

        // Call onEdit callback
        store.triggerOnEdit();

        // Sync global textarea value as well
        const textarea = store.getTextareaRef();
        if (textarea) {
            textarea.value = node.text?.toString?.() ?? "";
            textarea.setSelectionRange(this.cursor.offset, this.cursor.offset);
            console.log(`deleteForward: Synced textarea value: "${textarea.value}"`);
        }
    }

    /**
     * Merge with previous item
     */
    mergeWithPreviousItem() {
        const currentItem = this.cursor.findTarget();
        if (!currentItem) return;

        const prevItem = this.cursor.findPreviousItem();
        if (!prevItem) return;

        // Get text of previous item
        const prevText = prevItem.text?.toString?.() ?? "";
        const currentText = currentItem.text?.toString?.() ?? "";

        // Update text of previous item
        prevItem.updateText(prevText + currentText);

        // Delete current item
        (currentItem as any).delete();

        // Update cursor position
        const oldItemId = this.cursor.itemId;
        this.cursor.itemId = prevItem.id;
        this.cursor.offset = prevText.length;

        // Clear cursor of old item (after item deletion)
        store.clearCursorForItem(oldItemId);

        // Set active item
        store.setActiveItem(this.cursor.itemId);

        // Start cursor blinking
        store.startCursorBlink();
    }

    /**
     * Merge with next item
     */
    mergeWithNextItem() {
        const currentItem = this.cursor.findTarget();
        if (!currentItem) return;

        const nextItem = this.cursor.findNextItem();
        if (!nextItem) return;

        // Get text of current and next items
        const currentText = currentItem.text?.toString?.() ?? "";
        const nextText = nextItem.text?.toString?.() ?? "";

        // Update text of current item
        currentItem.updateText(currentText + nextText);

        // Delete next item
        (nextItem as any).delete();

        // Cursor position remains unchanged (end of current item)
    }

    /**
     * Delete empty item
     */
    deleteEmptyItem() {
        const currentItem = this.cursor.findTarget();
        if (!currentItem) return;

        // Do nothing if item is not empty
        const currentText = currentItem.text?.toString?.() ?? "";
        if (currentText.length > 0) return;

        // Find next item
        const nextItem = this.cursor.findNextItem();

        // Determine where to move cursor
        let targetItemId: string;
        let targetOffset: number;

        if (nextItem) {
            // If next item exists, move to start of next item
            targetItemId = nextItem.id;
            targetOffset = 0;
        } else {
            // If no next item, move to end of previous item
            const prevItem = this.cursor.findPreviousItem();
            if (prevItem) {
                targetItemId = prevItem.id;
                const prevText = prevItem.text?.toString?.() ?? "";
                targetOffset = prevText.length;
            } else {
                // If no previous item (last single item), do not delete
                return;
            }
        }

        // Clear cursor for current item
        store.clearCursorForItem(this.cursor.itemId);

        // Delete item
        (currentItem as any).delete();

        // Set cursor to new position
        this.cursor.itemId = targetItemId;
        this.cursor.offset = targetOffset;

        // Update store
        store.setActiveItem(this.cursor.itemId);
        store.setCursor({
            itemId: this.cursor.itemId,
            offset: this.cursor.offset,
            isActive: true,
            userId: this.cursor.userId,
        });

        // Start cursor blinking
        store.startCursorBlink();
    }
}

// Standalone utility exports used by CursorBase
export function deleteEmptyItem(current?: Item) {
    try {
        if (!current) return;
        const text = current.text?.toString?.() ?? "";
        if (text.length > 0) return;
        const parent = current.parent;
        const idx = parent ? parent.indexOf(current) : -1;
        const next = parent && idx >= 0 ? parent.at(idx + 1) : undefined;
        const prev = parent && idx > 0 ? parent.at(idx - 1) : undefined;

        // Clear cursor for the current item and delete it
        store.clearCursorForItem(current.id);
        (current as any).delete();

        // Move active item focus
        const target = next ?? prev ?? undefined;
        if (target) {
            store.setActiveItem(target.id);
            store.startCursorBlink();
        } else {
            store.setActiveItem(null);
        }
    } catch (e) {
        console.warn("deleteEmptyItem fallback failed:", e);
    }
}

export function mergeWithNextItem(current?: Item) {
    try {
        if (!current) return;
        const parent = current.parent;
        if (!parent) return;
        const idx = parent.indexOf(current);
        const next = parent.at(idx + 1);
        if (!next) return;

        const a = current.text?.toString?.() ?? "";
        const b = next.text?.toString?.() ?? "";
        current.updateText(a + b);
        (next as any).delete();

        store.setActiveItem(current.id);
        store.startCursorBlink();
    } catch (e) {
        console.warn("mergeWithNextItem fallback failed:", e);
    }
}

export function mergeWithPreviousItem(current?: Item) {
    try {
        if (!current) return;
        const parent = current.parent;
        if (!parent) return;
        const idx = parent.indexOf(current);
        const prev = idx > 0 ? parent.at(idx - 1) : undefined;
        if (!prev) return;

        const a = prev.text?.toString?.() ?? "";
        const b = current.text?.toString?.() ?? "";
        prev.updateText(a + b);
        const prevId = prev.id;
        (current as any).delete();

        store.setActiveItem(prevId);
        store.startCursorBlink();
    } catch (e) {
        console.warn("mergeWithPreviousItem fallback failed:", e);
    }
}
