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

/** Sparse negative regions make modifier toggles scalable without expanding a larger positive region. */
export interface GridCellExclusion {
    kind: "exclude-cells";
    rowIds: string[];
    columnIds: string[];
}

/** A specific cell re-added after a broader row/column exclusion. */
export interface GridCellOverride {
    kind: "include-cells";
    rowIds: string[];
    columnIds: string[];
}

export interface GridRowExclusion {
    kind: "exclude-rows";
    rowIds: string[];
}

export interface GridColumnExclusion {
    kind: "exclude-columns";
    columnIds: string[];
}

export type GridSelectionRegion =
    | GridCellRegion
    | GridRowRegion
    | GridColumnRegion
    | GridAllRegion
    | GridCellOverride
    | GridCellExclusion
    | GridRowExclusion
    | GridColumnExclusion;

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
    private regionIndexes: Array<{
        kind: GridSelectionRegion["kind"];
        rows: Set<string>;
        columns: Set<string>;
    }> = [];

    select(cell: GridCellAddress): void {
        this.activeCell = cell;
        this.anchorCell = cell;
        this.rowAnchor = undefined;
        this.columnAnchor = undefined;
        this.regions = [{ kind: "cells", rowIds: [cell.rowId], columnIds: [cell.columnId] }];
        this.indexRegions();
    }

    toggleCell(cell: GridCellAddress): void {
        this.activeCell = cell;
        this.anchorCell = cell;
        this.rowAnchor = undefined;
        this.columnAnchor = undefined;
        const wasSelected = this.contains(cell);
        if (wasSelected) {
            this.removePositiveCell(cell);
            if (this.contains(cell)) this.addCellExclusion(cell);
        } else if (this.removeCellExclusion(cell)) {
            // Removing a cell-sized exclusion exposes its underlying positive region.
        } else if (this.hasPositiveCell(cell)) {
            this.removePositiveCell(cell);
            this.regions.push({ kind: "include-cells", rowIds: [cell.rowId], columnIds: [cell.columnId] });
            this.indexRegions();
        } else if (this.isCoveredByPositiveRegion(cell)) {
            this.regions.push({ kind: "include-cells", rowIds: [cell.rowId], columnIds: [cell.columnId] });
            this.indexRegions();
        } else {
            this.regions.push({ kind: "cells", rowIds: [cell.rowId], columnIds: [cell.columnId] });
            this.indexRegions();
        }
        if (wasSelected && this.contains(cell)) {
            this.addCellExclusion(cell);
        }
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
        this.indexRegions();
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
        this.indexRegions();
    }

    contains(cell: GridCellAddress): boolean {
        if (
            this.regionIndexes.some(index =>
                index.kind === "include-cells" && index.rows.has(cell.rowId) && index.columns.has(cell.columnId)
            )
        ) return true;
        const selected = this.regionIndexes.some(index => {
            if (index.kind === "all") return true;
            if (index.kind === "rows") return index.rows.has(cell.rowId);
            if (index.kind === "columns") return index.columns.has(cell.columnId);
            return index.kind === "cells" && index.rows.has(cell.rowId) && index.columns.has(cell.columnId);
        });
        if (!selected) return false;
        return !this.regionIndexes.some(index =>
            (index.kind === "exclude-rows" && index.rows.has(cell.rowId))
            || (index.kind === "exclude-columns" && index.columns.has(cell.columnId))
            || (index.kind === "exclude-cells" && index.rows.has(cell.rowId) && index.columns.has(cell.columnId))
        );
    }

    containsRow(rowId: string): boolean {
        const selected = this.regionIndexes.some(index =>
            index.kind === "all" || (index.kind === "rows" && index.rows.has(rowId))
        );
        return selected && !this.regionIndexes.some(index => index.kind === "exclude-rows" && index.rows.has(rowId));
    }

    containsColumn(columnId: string): boolean {
        const selected = this.regionIndexes.some(index =>
            index.kind === "all" || (index.kind === "columns" && index.columns.has(columnId))
        );
        return selected
            && !this.regionIndexes.some(index => index.kind === "exclude-columns" && index.columns.has(columnId));
    }

    isAllSelected(): boolean {
        return this.regions.some(region => region.kind === "all")
            && !this.regions.some(region => region.kind.startsWith("exclude-"));
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
            if (region.kind === "exclude-rows") {
                const rowIds = region.rowIds.filter(id => rows.has(id));
                return rowIds.length ? [{ ...region, rowIds }] : [];
            }
            if (region.kind === "exclude-columns") {
                const columnIds = region.columnIds.filter(id => columns.has(id));
                return columnIds.length ? [{ ...region, columnIds }] : [];
            }
            if (region.kind === "exclude-cells" || region.kind === "include-cells") {
                const rowIds = region.rowIds.filter(id => rows.has(id));
                const columnIds = region.columnIds.filter(id => columns.has(id));
                return rowIds.length && columnIds.length ? [{ ...region, rowIds, columnIds }] : [];
            }
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
        this.indexRegions();

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
            this.indexRegions();
            return;
        }
        if (this.regions.some(region => region.kind === "all")) {
            this.toggleAllAxis(kind, ids);
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
        this.indexRegions();
    }

    private toggleAllAxis(kind: "rows" | "columns", ids: string[]): void {
        const excluded = new Set<string>();
        for (const region of this.regions) {
            if (kind === "rows" && region.kind === "exclude-rows") {
                for (const id of region.rowIds) excluded.add(id);
            } else if (kind === "columns" && region.kind === "exclude-columns") {
                for (const id of region.columnIds) excluded.add(id);
            }
        }
        for (const id of ids) {
            if (excluded.has(id)) excluded.delete(id);
            else excluded.add(id);
        }
        this.regions = this.regions.filter(region =>
            region.kind !== (kind === "rows" ? "exclude-rows" : "exclude-columns")
        );
        if (excluded.size > 0) {
            this.regions.push(
                kind === "rows"
                    ? { kind: "exclude-rows", rowIds: [...excluded] }
                    : { kind: "exclude-columns", columnIds: [...excluded] },
            );
        }
        this.indexRegions();
    }

    private addCellExclusion(cell: GridCellAddress): void {
        this.regions.push({ kind: "exclude-cells", rowIds: [cell.rowId], columnIds: [cell.columnId] });
        this.indexRegions();
    }

    private hasPositiveCell(cell: GridCellAddress): boolean {
        return this.regions.some(region =>
            (region.kind === "cells" || region.kind === "include-cells")
            && region.rowIds.length === 1 && region.columnIds.length === 1
            && region.rowIds[0] === cell.rowId && region.columnIds[0] === cell.columnId
        );
    }

    private removePositiveCell(cell: GridCellAddress): void {
        this.regions = this.regions.filter(region =>
            !((region.kind === "cells" || region.kind === "include-cells")
                && region.rowIds.length === 1 && region.columnIds.length === 1
                && region.rowIds[0] === cell.rowId && region.columnIds[0] === cell.columnId)
        );
        this.indexRegions();
    }

    private isCoveredByPositiveRegion(cell: GridCellAddress): boolean {
        return this.regionIndexes.some(index =>
            index.kind === "all"
            || (index.kind === "rows" && index.rows.has(cell.rowId))
            || (index.kind === "columns" && index.columns.has(cell.columnId))
            || (index.kind === "cells" && index.rows.has(cell.rowId) && index.columns.has(cell.columnId))
        );
    }

    private removeCellExclusion(cell: GridCellAddress): boolean {
        const previousLength = this.regions.length;
        this.regions = this.regions.filter(region =>
            !(region.kind === "exclude-cells" && region.rowIds?.[0] === cell.rowId
                && region.columnIds?.[0] === cell.columnId)
        );
        if (this.regions.length === previousLength) return false;
        this.indexRegions();
        return true;
    }

    private indexRegions(): void {
        this.regionIndexes = this.regions.map(region => ({
            kind: region.kind,
            rows: new Set("rowIds" in region ? region.rowIds ?? [] : []),
            columns: new Set("columnIds" in region ? region.columnIds ?? [] : []),
        }));
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
