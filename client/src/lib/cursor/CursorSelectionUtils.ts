import type { SelectionRange } from "../../stores/EditorOverlayStore.svelte";
import { editorOverlayStore as store } from "../../stores/EditorOverlayStore.svelte";

export interface SingleItemSelection {
    selection: SelectionRange;
    startOffset: number;
    endOffset: number;
}

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
 * Determine if the provided selection has unknown length.
 */
export function selectionHasRange(selection: SelectionRange | undefined): boolean {
    if (!selection) return false;

    return selection.startItemId !== selection.endItemId
        || selection.startOffset !== selection.endOffset;
}

/**
 * Determine if the selection spans multiple items.
 */
export function selectionSpansMultipleItems(selection: SelectionRange | undefined): boolean {
    if (!selection) return false;
    return selection.startItemId !== selection.endItemId;
}

/**
 * Normalize offsets so startOffset <= endOffset.
 */
export function normalizeSelectionOffsets(selection: SelectionRange): {
    startOffset: number;
    endOffset: number;
} {
    const startOffset = Math.min(selection.startOffset, selection.endOffset);
    const endOffset = Math.max(selection.startOffset, selection.endOffset);
    return { startOffset, endOffset };
}

/**
 * Return the active single-item selection for the provided user.
 */
export function getSingleItemSelectionForUser(
    userId: string,
    itemId?: string,
): SingleItemSelection | undefined {
    const selection = getSelectionForUser(userId);
    if (!selection) return undefined;
    if (selection.startItemId !== selection.endItemId) return undefined;
    if (itemId && selection.startItemId !== itemId) return undefined;

    const { startOffset, endOffset } = normalizeSelectionOffsets(selection);
    return { selection, startOffset, endOffset };
}

/**
 * Determine if a user currently has an active selection.
 */
export function hasSelection(userId: string): boolean {
    return selectionHasRange(getSelectionForUser(userId));
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
