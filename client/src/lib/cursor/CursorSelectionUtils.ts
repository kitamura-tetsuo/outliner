// @ts-nocheck
import { editorOverlayStore as store } from "../../stores/EditorOverlayStore.svelte";

/**
 * Clear selection for the current user
 */
export function clearSelection(userId: string) {
    store.clearSelectionForUser(userId);
}

/**
 * Set selection in the store
 */
export function setSelection(selection: any) {
    store.setSelection(selection);
}

/**
 * Get selection for the current user
 */
export function getSelectionForUser(userId: string): any | undefined {
    return Object.values(store.selections).find(s => s.userId === userId);
}

/**
 * Check if there is a selection for the current user
 */
export function hasSelection(userId: string): boolean {
    const selection = getSelectionForUser(userId);
    return !!selection
        && (selection.startOffset !== selection.endOffset
            || selection.startItemId !== selection.endItemId);
}

/**
 * Get selected text from a single item
 */
export function getSelectedTextFromItem(itemText: string, selection: any): string {
    if (!selection) return "";

    const startOffset = Math.min(selection.startOffset, selection.endOffset);
    const endOffset = Math.max(selection.startOffset, selection.endOffset);
    return itemText.substring(startOffset, endOffset);
}
