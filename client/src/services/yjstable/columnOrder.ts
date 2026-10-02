import { type GridHandles, setGridColumnOrder } from "./gridDocs";

/**
 * `DataTransfer` type carried by a column-reorder drag, in the grid and in the
 * UI Definition editor alike. It identifies the drag as the Grid block's own
 * (see `services/dnd/blockDndOwnership`) while the payload is still unreadable,
 * so unrelated drops inside the Grid keep reaching the host outliner item.
 */
export const COLUMN_DRAG_TYPE = "application/x-yjstable-column";

/** Stored order, reconciled against the columns the query actually returned (shared with the server). */
export { orderColumns } from "$shared/services/gridDefinition";

/** Move `column` to `targetIndex` within the current effective order. */
export function moveColumn(effectiveOrder: string[], column: string, targetIndex: number): string[] {
    const currentIndex = effectiveOrder.indexOf(column);
    if (currentIndex === -1) {
        return [...effectiveOrder];
    }

    // Clamp targetIndex
    const safeTarget = Math.max(0, Math.min(targetIndex, effectiveOrder.length - 1));
    if (currentIndex === safeTarget) {
        return [...effectiveOrder];
    }

    const nextOrder = [...effectiveOrder];
    nextOrder.splice(currentIndex, 1);
    nextOrder.splice(safeTarget, 0, column);

    return nextOrder;
}

/**
 * Calculate the target index for insertion based on dragging index and drop side/position.
 */
export function calculateDropIndex(
    draggedIndex: number,
    hoverIndex: number,
    position: "left" | "right" | "above" | "below",
): number {
    let targetIndex = hoverIndex;
    if (draggedIndex < targetIndex && (position === "left" || position === "above")) {
        targetIndex -= 1;
    } else if (draggedIndex > targetIndex && (position === "right" || position === "below")) {
        targetIndex += 1;
    }
    return targetIndex;
}

/** Replace the stored column order on the Grid definition. */
export function writeColumnOrder(handles: GridHandles, order: string[]): void {
    setGridColumnOrder(handles, order);
}
