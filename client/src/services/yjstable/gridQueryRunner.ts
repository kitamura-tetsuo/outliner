// Executes the SELECT of one Grid definition against the shared project schema.
//
// A GridQueryRunner is the counterpart of the Table sync adapter: the adapter
// keeps the source Table's data materialized in PGlite, the runner reads a
// Grid's SELECT+column settings and streams results back to the view. Several
// runners can bind to the same Table adapter (one Table, many Grids) without
// duplicating materialization.
//
// Everything that is not Grid-specific — debounce, staleness, the schema gate,
// listener fan-out — lives in `TableQueryRunnerBase`, which the Table's own
// raw-data browser reuses through `RawTableQueryRunner`.

import type * as Y from "yjs";
import { getGridQuery, type GridHandles } from "./gridDocs";
import { TableQueryRunnerBase, type TableRunnerCallbacks, type TableRunnerOptions } from "./tableQueryRunner";

export type GridRunnerCallbacks = TableRunnerCallbacks;

export interface GridRunnerOptions extends TableRunnerOptions {
    grid: GridHandles;
}

export class GridQueryRunner extends TableQueryRunnerBase {
    private readonly grid: GridHandles;

    private readonly gridObserver = (events: Y.YEvent<Y.AbstractType<unknown>>[]) => {
        // Any change to the Grid entry may impact the query result: the query
        // text itself, or a column setting that changes what a downstream view
        // renders (columnOrder/labels/hidden/component type). We only need to
        // requery when the query text changes; UI-only fields are read
        // directly from the Grid by the view. Debounce keeps rapid typing
        // from thrashing PGlite.
        for (const event of events) {
            if (event.target === this.grid.entry && event.changes.keys.has("query")) {
                this.invalidateQuery();
                return;
            }
        }
    };

    constructor(options: GridRunnerOptions) {
        super(options);
        this.grid = options.grid;
    }

    protected currentQuery(): string {
        return getGridQuery(this.grid);
    }

    protected observeQuerySource(): void {
        this.grid.entry.observeDeep(this.gridObserver);
    }

    protected unobserveQuerySource(): void {
        this.grid.entry.unobserveDeep(this.gridObserver);
    }
}
