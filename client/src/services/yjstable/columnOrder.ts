import * as Y from "yjs";
import type { TableHandles } from "./tableDocs";

/**
 * `DataTransfer` type carried by a column-reorder drag, in the grid and in the
 * UI Definition editor alike. It identifies the drag as the table block's own
 * (see `services/dnd/blockDndOwnership`) while the payload is still unreadable,
 * so unrelated drops inside the table keep reaching the host outliner item.
 */
export const COLUMN_DRAG_TYPE = "application/x-yjstable-column";

/** Stored order, reconciled against the columns the query actually returned. */
export function orderColumns(resultColumns: string[], storedOrder: string[]): string[] {
    const resultColSet = new Set(resultColumns);
    const ordered: string[] = [];
    const orderedSet = new Set<string>();

    // 1. Keep stored columns that exist in the result.
    for (const col of storedOrder) {
        if (resultColSet.has(col) && !orderedSet.has(col)) {
            ordered.push(col);
            orderedSet.add(col);
        }
    }

    // 2. Append result columns that are not in the stored order (newly added or not yet saved).
    for (const col of resultColumns) {
        if (!orderedSet.has(col)) {
            ordered.push(col);
            orderedSet.add(col);
        }
    }

    return ordered;
}

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

/** Replace the stored column order as a single scalar in the map. */
export function writeColumnOrder(handles: TableHandles, order: string[]): void {
    handles.doc.transact(() => {
        handles.uiDef.set("columnOrder", order);
    });
}
