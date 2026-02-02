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
    private cursor: Cursor; // Holds the Cursor class instance

    constructor(cursor: Cursor) {
        this.cursor = cursor;
    }

    /**
     * Inserts text.
     * @param ch The text to insert
     */
    insertText(ch: string) {
        // Reset initial column position since this is not a vertical navigation operation
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
            // Delete the selected text
            const startOffset = Math.min(selection.startOffset, selection.endOffset);
            const endOffset = Math.max(selection.startOffset, selection.endOffset);
            const txt = currentText.slice(0, startOffset) + ch + currentText.slice(endOffset);
            node.updateText(txt);

            // Update cursor position
            this.cursor.offset = startOffset + ch.length;

            // Clear the selection
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

        // Trigger the onEdit callback
        store.triggerOnEdit();

        // Note: Do not sync the global textarea value.
        // In a multi-cursor environment, multiple items may be edited simultaneously,
        // so setting a specific item's value to a single textarea is not appropriate.
    }

    /**
     * Deletes the character before the cursor position.
     */
    deleteBackward() {
        // Reset initial column position since this is not a vertical navigation operation
        this.cursor.resetInitialColumn();

        const node = this.cursor.findTarget();
        if (!node) return;

        // If there is a selection, delete it
        const selection = Object.values(store.selections).find(s => s.userId === this.cursor.userId);

        if (selection && selection.startOffset !== selection.endOffset) {
            // If the selection spans multiple items
            if (selection.startItemId !== selection.endItemId) {
                this.cursor.deleteMultiItemSelection(selection);
                return;
            }

            // If the selection is within a single item
            if (selection.startItemId === this.cursor.itemId && selection.endItemId === this.cursor.itemId) {
                // Delete the selected text
                const startOffset = Math.min(selection.startOffset, selection.endOffset);
                const endOffset = Math.max(selection.startOffset, selection.endOffset);
                const txt = node.text?.toString?.() ?? "";
                const newTxt = txt.slice(0, startOffset) + txt.slice(endOffset);
                node.updateText(newTxt);

                // Update cursor position
                this.cursor.offset = startOffset;

                // Clear the selection
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
                // Merge with the previous item if at the beginning of the line
                this.mergeWithPreviousItem();
            }
        }

        this.cursor.applyToStore();

        // Trigger the onEdit callback
        store.triggerOnEdit();

        // Note: Do not sync the global textarea value.
        // In a multi-cursor environment, multiple items may be edited simultaneously,
        // so setting a specific item's value to a single textarea is not appropriate.
    }

    /**
     * Deletes the character after the cursor position.
     */
    deleteForward() {
        // Reset initial column position since this is not a vertical navigation operation
        this.cursor.resetInitialColumn();

        const node = this.cursor.findTarget();
        if (!node) return;

        // If there is a selection, delete it
        const selection = Object.values(store.selections).find(s => s.userId === this.cursor.userId);

        if (selection && selection.startOffset !== selection.endOffset) {
            // If the selection spans multiple items
            if (selection.startItemId !== selection.endItemId) {
                this.cursor.deleteMultiItemSelection(selection);
                return;
            }

            // If the selection is within a single item
            if (selection.startItemId === this.cursor.itemId && selection.endItemId === this.cursor.itemId) {
                // Delete the selected text
                const startOffset = Math.min(selection.startOffset, selection.endOffset);
                const endOffset = Math.max(selection.startOffset, selection.endOffset);
                const txtSel = node.text?.toString?.() ?? "";
                const newTxtSel = txtSel.slice(0, startOffset) + txtSel.slice(endOffset);
                node.updateText(newTxtSel);

                // Update cursor position
                this.cursor.offset = startOffset;

                // Clear the selection
                this.cursor.clearSelection();
            }
        } else {
            // Normal deletion
            const txt = node.text?.toString?.() ?? "";
            if (this.cursor.offset < txt.length) {
                const newTxt = txt.slice(0, this.cursor.offset) + txt.slice(this.cursor.offset + 1);
                node.updateText(newTxt);
            } else {
                // If at the end of the line
                // If the item is empty, delete the item itself
                if (txt.length === 0) {
                    this.deleteEmptyItem();
                    return;
                }
                // If not empty, merge with the next item
                this.mergeWithNextItem();
            }
        }

        this.cursor.applyToStore();

        // Trigger the onEdit callback
        store.triggerOnEdit();

        // Sync the global textarea value as well
        const textarea = store.getTextareaRef();
        if (textarea) {
            textarea.value = node.text?.toString?.() ?? "";
            textarea.setSelectionRange(this.cursor.offset, this.cursor.offset);
            console.log(`deleteForward: Synced textarea value: "${textarea.value}"`);
        }
    }

    /**
     * Merges with the previous item.
     */
    mergeWithPreviousItem() {
        const currentItem = this.cursor.findTarget();
        if (!currentItem) return;

        const prevItem = this.cursor.findPreviousItem();
        if (!prevItem) return;

        // Get the text of the previous item
        const prevText = prevItem.text?.toString?.() ?? "";
        const currentText = currentItem.text?.toString?.() ?? "";

        // Update the text of the previous item
        prevItem.updateText(prevText + currentText);

        // Delete the current item
        (currentItem as any).delete();

        // Update cursor position
        const oldItemId = this.cursor.itemId;
        this.cursor.itemId = prevItem.id;
        this.cursor.offset = prevText.length;

        // Clear the cursor of the old item (after item deletion)
        store.clearCursorForItem(oldItemId);

        // Set the active item
        store.setActiveItem(this.cursor.itemId);

        // Start cursor blinking
        store.startCursorBlink();
    }

    /**
     * Merges with the next item.
     */
    mergeWithNextItem() {
        const currentItem = this.cursor.findTarget();
        if (!currentItem) return;

        const nextItem = this.cursor.findNextItem();
        if (!nextItem) return;

        // Get the text of the current and next items
        const currentText = currentItem.text?.toString?.() ?? "";
        const nextText = nextItem.text?.toString?.() ?? "";

        // Update the text of the current item
        currentItem.updateText(currentText + nextText);

        // Delete the next item
        (nextItem as any).delete();

        // Cursor position remains unchanged (at the end of the current item)
    }

    /**
     * Deletes an empty item.
     */
    deleteEmptyItem() {
        const currentItem = this.cursor.findTarget();
        if (!currentItem) return;

        // Do nothing if the item is not empty
        const currentText = currentItem.text?.toString?.() ?? "";
        if (currentText.length > 0) return;

        // Find the next item
        const nextItem = this.cursor.findNextItem();

        // Determine where to move the cursor
        let targetItemId: string;
        let targetOffset: number;

        if (nextItem) {
            // If there is a next item, move to the beginning of it
            targetItemId = nextItem.id;
            targetOffset = 0;
        } else {
            // If there is no next item, move to the end of the previous item
            const prevItem = this.cursor.findPreviousItem();
            if (prevItem) {
                targetItemId = prevItem.id;
                const prevText = prevItem.text?.toString?.() ?? "";
                targetOffset = prevText.length;
            } else {
                // If there is no previous item either (the last single item), do not delete
                return;
            }
        }

        // Clear the cursor for the current item
        store.clearCursorForItem(this.cursor.itemId);

        // Delete the item
        (currentItem as any).delete();

        // Set the cursor to the new position
        this.cursor.itemId = targetItemId;
        this.cursor.offset = targetOffset;

        // Update the store
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
