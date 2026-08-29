// Pure keyboard-navigation math for Grid: computes the next logical active
// cell from stable row/column identities only. Never depends on DOM row
// indexes, so a query refresh that reorders or filters rows cannot cause
// navigation to land on the wrong record.

import type { GridCellAddress } from "./gridSelection";

export type GridNavDirection = "up" | "down" | "left" | "right";

export interface MoveActiveCellOptions {
    /**
     * Horizontal movement wraps to the next/previous row at the row edge,
     * matching spreadsheet Tab behavior. Plain arrow keys clamp instead.
     */
    wrap?: boolean;
}

/**
 * Returns the cell one step from `current` in `direction`, or `undefined`
 * when that step would leave the grid (arrow keys clamp at the edge; Tab
 * wraps to the adjacent row when `wrap` is set).
 */
export function moveActiveCell(
    current: GridCellAddress,
    direction: GridNavDirection,
    rowOrder: readonly string[],
    columnOrder: readonly string[],
    options?: MoveActiveCellOptions,
): GridCellAddress | undefined {
    const rowIndex = rowOrder.indexOf(current.rowId);
    const colIndex = columnOrder.indexOf(current.columnId);
    if (rowIndex < 0 || colIndex < 0 || rowOrder.length === 0 || columnOrder.length === 0) return undefined;

    const wrap = options?.wrap ?? false;
    let nextRow = rowIndex;
    let nextCol = colIndex;

    switch (direction) {
        case "up":
            nextRow--;
            break;
        case "down":
            nextRow++;
            break;
        case "left":
            nextCol--;
            if (wrap && nextCol < 0) {
                nextCol = columnOrder.length - 1;
                nextRow--;
            }
            break;
        case "right":
            nextCol++;
            if (wrap && nextCol >= columnOrder.length) {
                nextCol = 0;
                nextRow++;
            }
            break;
    }

    if (nextRow < 0 || nextRow >= rowOrder.length || nextCol < 0 || nextCol >= columnOrder.length) {
        return undefined;
    }
    return { rowId: rowOrder[nextRow], columnId: columnOrder[nextCol] };
}

/**
 * True for a keydown that types a single visible character (not a modifier
 * combo, and not a multi-character key name like "Enter" or "ArrowLeft").
 * Used to start editing a Grid cell from navigation mode, spreadsheet-style.
 */
export function isPrintableKey(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey">): boolean {
    return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}
