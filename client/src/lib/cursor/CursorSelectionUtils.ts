import type { SelectionRange } from "../../stores/EditorOverlayStore.svelte";
import { editorOverlayStore as store } from "../../stores/EditorOverlayStore.svelte";
import { selectionCoversContent, textSelectionOffsetBounds } from "../selection/selectionEndpoints";

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
 * Determine if the provided selection has any length.
 */
export function selectionHasRange(selection: SelectionRange | undefined): boolean {
    if (!selection) return false;

    return selectionCoversContent(selection);
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
 *
 * Both ends must be text positions: an atomic visual node has no offset to order (#5025),
 * so a range reaching one gives a zero-length result rather than an invented interval.
 */
export function normalizeSelectionOffsets(selection: SelectionRange): {
    startOffset: number;
    endOffset: number;
} {
    const bounds = textSelectionOffsetBounds(selection);
    return { startOffset: bounds?.low ?? 0, endOffset: bounds?.high ?? 0 };
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
    // A caret operation needs character offsets, which only a text range has.
    const bounds = textSelectionOffsetBounds(selection);
    if (!bounds) return undefined;

    const { startOffset, endOffset } = { startOffset: bounds.low, endOffset: bounds.high };
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

    const bounds = textSelectionOffsetBounds(selection);
    if (!bounds) return "";
    return itemText.substring(bounds.low, bounds.high);
}
