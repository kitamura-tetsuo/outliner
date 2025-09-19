import type { SelectionRange } from "../../stores/EditorOverlayStore.svelte";
import { editorOverlayStore as store } from "../../stores/EditorOverlayStore.svelte";

function getSelections(): SelectionRange[] {
    return Object.values(store.selections as Record<string, SelectionRange>);
}

/**
 * Clear selection for the specified user.
 */
export function clearSelection(userId: string): void {
    store.clearSelectionForUser(userId);
}

/**
 * Persist the provided selection in the overlay store.
 */
export function setSelection(selection: SelectionRange): string | undefined {
    return store.setSelection(selection);
}

/**
 * Retrieve the selection associated with a user.
 */
export function getSelectionForUser(userId: string): SelectionRange | undefined {
    return getSelections().find(selection => selection.userId === userId);
}

/**
 * Determine if a user currently has an active selection.
 */
export function hasSelection(userId: string): boolean {
    const selection = getSelectionForUser(userId);
    if (!selection) return false;

    return selection.startItemId !== selection.endItemId
        || selection.startOffset !== selection.endOffset;
}

/**
 * Slice the provided text according to the given selection.
 */
export function getSelectedTextFromItem(itemText: string, selection?: SelectionRange): string {
    if (!selection) return "";

    const startOffset = Math.min(selection.startOffset, selection.endOffset);
    const endOffset = Math.max(selection.startOffset, selection.endOffset);
    return itemText.substring(startOffset, endOffset);
}
