/** A cell is addressed only by durable query identities, never by DOM position. */
export interface GridCellAddress {
    rowId: string;
    columnId: string;
}

export interface GridCellRegion {
    kind: "cells";
    rowIds: string[];
    columnIds: string[];
}

export interface GridRowRegion {
    kind: "rows";
    rowIds: string[];
}

export interface GridColumnRegion {
    kind: "columns";
    columnIds: string[];
}

/** Represents the query result, including rows that are not mounted in the DOM. */
export interface GridAllRegion {
    kind: "all";
}

export type GridSelectionRegion = GridCellRegion | GridRowRegion | GridColumnRegion | GridAllRegion;

export interface GridSelectionSnapshot {
    activeCell?: GridCellAddress;
    anchorCell?: GridCellAddress;
    rowAnchor?: string;
    columnAnchor?: string;
    regions: GridSelectionRegion[];
}

export interface HeaderSelectionOptions {
    extend?: boolean;
    toggle?: boolean;
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
    rowAnchor: string | undefined;
    columnAnchor: string | undefined;
    regions: GridSelectionRegion[] = [];

    select(cell: GridCellAddress): void {
        this.activeCell = cell;
        this.anchorCell = cell;
        this.rowAnchor = undefined;
        this.columnAnchor = undefined;
        this.regions = [{ kind: "cells", rowIds: [cell.rowId], columnIds: [cell.columnId] }];
    }

    toggleCell(cell: GridCellAddress): void {
        this.activeCell = cell;
        this.anchorCell = cell;
        this.rowAnchor = undefined;
        this.columnAnchor = undefined;
        const regions = this.regions.filter(region => {
            return !(region.kind === "cells" && region.rowIds.length === 1 && region.columnIds.length === 1
                && region.rowIds[0] === cell.rowId && region.columnIds[0] === cell.columnId);
        });
        if (regions.length === this.regions.length && !this.contains(cell)) {
            regions.push({ kind: "cells", rowIds: [cell.rowId], columnIds: [cell.columnId] });
        }
        this.regions = regions;
        if (!this.contains(cell)) this.activeCell = undefined;
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
    }

    selectRow(rowId: string, rowOrder: readonly string[], options: HeaderSelectionOptions = {}): void {
        const ids = options.extend && this.rowAnchor ? axisRange(rowOrder, this.rowAnchor, rowId) : [rowId];
        if (ids.length === 0) return;
        this.activeCell = undefined;
        this.anchorCell = undefined;
        this.columnAnchor = undefined;
        if (!options.extend) this.rowAnchor = rowId;
        this.updateAxis("rows", ids, options.toggle === true);
    }

    selectColumn(columnId: string, columnOrder: readonly string[], options: HeaderSelectionOptions = {}): void {
        const ids = options.extend && this.columnAnchor
            ? axisRange(columnOrder, this.columnAnchor, columnId)
            : [columnId];
        if (ids.length === 0) return;
        this.activeCell = undefined;
        this.anchorCell = undefined;
        this.rowAnchor = undefined;
        if (!options.extend) this.columnAnchor = columnId;
        this.updateAxis("columns", ids, options.toggle === true);
    }

    selectAll(): void {
        this.activeCell = undefined;
        this.anchorCell = undefined;
        this.rowAnchor = undefined;
        this.columnAnchor = undefined;
        this.regions = [{ kind: "all" }];
    }

    contains(cell: GridCellAddress): boolean {
        return this.regions.some(region => {
            if (region.kind === "all") return true;
            if (region.kind === "rows") return region.rowIds.includes(cell.rowId);
            if (region.kind === "columns") return region.columnIds.includes(cell.columnId);
            return region.rowIds.includes(cell.rowId) && region.columnIds.includes(cell.columnId);
        });
    }

    containsRow(rowId: string): boolean {
        return this.regions.some(region =>
            region.kind === "all" || (region.kind === "rows" && region.rowIds.includes(rowId))
        );
    }

    containsColumn(columnId: string): boolean {
        return this.regions.some(region =>
            region.kind === "all" || (region.kind === "columns" && region.columnIds.includes(columnId))
        );
    }

    isAllSelected(): boolean {
        return this.regions.some(region => region.kind === "all");
    }

    isActive(cell: GridCellAddress): boolean {
        return this.activeCell?.rowId === cell.rowId && this.activeCell.columnId === cell.columnId;
    }

    /** Intersect logical identities with the refreshed query result. */
    reconcile(rowOrder: readonly string[], columnOrder: readonly string[]): void {
        const rows = new Set(rowOrder);
        const columns = new Set(columnOrder);
        this.regions = this.regions.flatMap<GridSelectionRegion>(region => {
            if (region.kind === "all") return [region];
            if (region.kind === "rows") {
                const rowIds = region.rowIds.filter(id => rows.has(id));
                return rowIds.length ? [{ ...region, rowIds }] : [];
            }
            if (region.kind === "columns") {
                const columnIds = region.columnIds.filter(id => columns.has(id));
                return columnIds.length ? [{ ...region, columnIds }] : [];
            }
            const rowIds = region.rowIds.filter(id => rows.has(id));
            const columnIds = region.columnIds.filter(id => columns.has(id));
            return rowIds.length && columnIds.length ? [{ ...region, rowIds, columnIds }] : [];
        });

        const activeExists = this.activeCell && rows.has(this.activeCell.rowId)
            && columns.has(this.activeCell.columnId) && this.contains(this.activeCell);
        if (!activeExists) this.activeCell = this.firstVisibleSelectedCell(rowOrder, columnOrder);
        const anchorExists = this.anchorCell && rows.has(this.anchorCell.rowId)
            && columns.has(this.anchorCell.columnId);
        if (!anchorExists) this.anchorCell = this.activeCell;
        if (this.rowAnchor && !rows.has(this.rowAnchor)) this.rowAnchor = undefined;
        if (this.columnAnchor && !columns.has(this.columnAnchor)) this.columnAnchor = undefined;
    }

    snapshot(): GridSelectionSnapshot {
        return structuredClone({
            activeCell: this.activeCell,
            anchorCell: this.anchorCell,
            rowAnchor: this.rowAnchor,
            columnAnchor: this.columnAnchor,
            regions: this.regions,
        });
    }

    private updateAxis(kind: "rows" | "columns", ids: string[], toggle: boolean): void {
        if (!toggle) {
            this.regions = [kind === "rows" ? { kind, rowIds: ids } : { kind, columnIds: ids }];
            return;
        }
        const selected = new Set<string>();
        const other = this.regions.filter(region => {
            if (region.kind !== kind) return true;
            if (region.kind === "rows") {
                for (const id of region.rowIds) selected.add(id);
            } else {
                for (const id of region.columnIds) selected.add(id);
            }
            return false;
        });
        for (const id of ids) {
            if (selected.has(id)) selected.delete(id);
            else selected.add(id);
        }
        if (selected.size > 0) {
            other.push(
                kind === "rows"
                    ? { kind, rowIds: [...selected] }
                    : { kind, columnIds: [...selected] },
            );
        }
        this.regions = other;
    }

    private firstVisibleSelectedCell(
        rowOrder: readonly string[],
        columnOrder: readonly string[],
    ): GridCellAddress | undefined {
        // Pure row/column/all selections deliberately have no artificial active cell.
        if (!this.regions.some(region => region.kind === "cells")) return undefined;
        for (const rowId of rowOrder) {
            for (const columnId of columnOrder) {
                const cell = { rowId, columnId };
                if (this.contains(cell)) return cell;
            }
        }
        return undefined;
    }
}
