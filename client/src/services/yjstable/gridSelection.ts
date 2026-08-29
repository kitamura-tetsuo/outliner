/** A cell is addressed only by durable query identities, never by DOM position. */
export interface GridCellAddress {
    rowId: string;
    columnId: string;
}

/**
 * A rectangular selection stored as two axis lists.  The cross product is the
 * selected cells, so even a million-cell rectangle needs only rows + columns
 * entries. `kind` is deliberately explicit so row/column/all regions can be
 * added without changing consumers to an enumerated-cell representation.
 */
export interface GridCellRegion {
    kind: "cells";
    rowIds: string[];
    columnIds: string[];
}

export interface GridSelectionSnapshot {
    activeCell?: GridCellAddress;
    anchorCell?: GridCellAddress;
    regions: GridCellRegion[];
}

function axisRange(values: readonly string[], from: string, to: string): string[] {
    const fromIndex = values.indexOf(from);
    const toIndex = values.indexOf(to);
    if (fromIndex < 0 || toIndex < 0) return [];
    return values.slice(Math.min(fromIndex, toIndex), Math.max(fromIndex, toIndex) + 1);
}

/** Local, ephemeral Grid selection. This object is intentionally unaware of Yjs. */
export class GridSelection {
    activeCell: GridCellAddress | undefined;
    anchorCell: GridCellAddress | undefined;
    regions: GridCellRegion[] = [];
    private regionIndexes: Array<{ rows: Set<string>; columns: Set<string>; }> = [];

    select(cell: GridCellAddress): void {
        this.activeCell = cell;
        this.anchorCell = cell;
        this.regions = [{ kind: "cells", rowIds: [cell.rowId], columnIds: [cell.columnId] }];
        this.indexRegions();
    }

    extend(cell: GridCellAddress, rowOrder: readonly string[], columnOrder: readonly string[]): void {
        const anchor = this.anchorCell;
        if (!anchor || !rowOrder.includes(anchor.rowId) || !columnOrder.includes(anchor.columnId)) {
            this.select(cell);
            return;
        }
        this.activeCell = cell;
        this.regions = [{
            kind: "cells",
            rowIds: axisRange(rowOrder, anchor.rowId, cell.rowId),
            columnIds: axisRange(columnOrder, anchor.columnId, cell.columnId),
        }];
        this.indexRegions();
    }

    contains(cell: GridCellAddress): boolean {
        return this.regionIndexes.some(index => index.rows.has(cell.rowId) && index.columns.has(cell.columnId));
    }

    isActive(cell: GridCellAddress): boolean {
        return this.activeCell?.rowId === cell.rowId && this.activeCell.columnId === cell.columnId;
    }

    /**
     * Intersect selection with a refreshed result by identity. If the active
     * cell vanished, choose the first remaining selected cell in the new
     * result order; never transfer activity to the record at its old index.
     */
    reconcile(rowOrder: readonly string[], columnOrder: readonly string[]): void {
        const rows = new Set(rowOrder);
        const columns = new Set(columnOrder);
        this.regions = this.regions
            .map(region => ({
                ...region,
                rowIds: region.rowIds.filter(id => rows.has(id)),
                columnIds: region.columnIds.filter(id => columns.has(id)),
            }))
            .filter(region => region.rowIds.length > 0 && region.columnIds.length > 0);
        this.indexRegions();

        const exists = (cell: GridCellAddress | undefined) =>
            cell !== undefined && rows.has(cell.rowId) && columns.has(cell.columnId) && this.contains(cell);
        if (!exists(this.activeCell)) {
            const replacement = this.firstVisibleSelectedCell(rowOrder, columnOrder);
            this.activeCell = replacement;
        }
        if (!exists(this.anchorCell)) this.anchorCell = this.activeCell;
    }

    snapshot(): GridSelectionSnapshot {
        return {
            activeCell: this.activeCell ? { ...this.activeCell } : undefined,
            anchorCell: this.anchorCell ? { ...this.anchorCell } : undefined,
            regions: this.regions.map(region => ({
                kind: region.kind,
                rowIds: [...region.rowIds],
                columnIds: [...region.columnIds],
            })),
        };
    }

    private firstVisibleSelectedCell(
        rowOrder: readonly string[],
        columnOrder: readonly string[],
    ): GridCellAddress | undefined {
        for (const rowId of rowOrder) {
            for (const columnId of columnOrder) {
                const cell = { rowId, columnId };
                if (this.contains(cell)) return cell;
            }
        }
        return undefined;
    }

    private indexRegions(): void {
        this.regionIndexes = this.regions.map(region => ({
            rows: new Set(region.rowIds),
            columns: new Set(region.columnIds),
        }));
    }
}
