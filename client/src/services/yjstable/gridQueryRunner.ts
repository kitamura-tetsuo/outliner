// Executes the SELECT of one Grid definition against the shared project schema.
//
// A GridQueryRunner is the counterpart of the Table sync adapter: the adapter
// keeps the source Table's data materialized in PGlite, the runner reads a
// Grid's SELECT+column settings and streams results back to the view. Several
// runners can bind to the same Table adapter (one Table, many Grids) without
// duplicating materialization.
//
// The runner debounces re-execution around three inputs:
//   - Grid state (query text) changes  -> Yjs observer on the Grid entry.
//   - Source Table schema changes      -> onSchemaChanged from the adapter.
//   - Source Table data changes        -> onDataApplied from the adapter.

import type * as Y from "yjs";
import { getLogger } from "../../lib/logger";
import { getGridQuery, type GridHandles } from "./gridDocs";
import { TableSqlError, toTableSqlError } from "./pgliteService";
import {
    executeGridQuery,
    REQUERY_DEBOUNCE_MS,
    type RelationRegistryPort,
    type TableQueryResult,
    TableSyncAdapter,
} from "./tableSyncAdapter";

const logger = getLogger("gridQueryRunner");

export interface GridRunnerCallbacks {
    onResult?: (result: TableQueryResult) => void;
    onError?: (message: string | undefined) => void;
}

export interface GridRunnerOptions {
    grid: GridHandles;
    /** The adapter of the Grid's source Table (materialization + registry). */
    sourceAdapter: TableSyncAdapter;
    /** Optional registry override (defaults to `sourceAdapter.relationRegistry`). */
    registry?: RelationRegistryPort;
}

export class GridQueryRunner {
    private readonly grid: GridHandles;
    private readonly sourceAdapter: TableSyncAdapter;
    private readonly registry: RelationRegistryPort | undefined;

    private readonly listeners = new Set<GridRunnerCallbacks>();
    private lastResult: TableQueryResult = { columns: [], rows: [] };
    private lastError: string | undefined;

    private requeryTimer: ReturnType<typeof setTimeout> | undefined;
    private queryGeneration = 0;
    private disposed = false;
    private started = false;

    private unsubscribeSource: (() => void) | undefined;

    private readonly gridObserver = (events: Y.YEvent<Y.AbstractType<unknown>>[]) => {
        // Any change to the Grid entry may impact the query result: the query
        // text itself, or a column setting that changes what a downstream view
        // renders (columnOrder/labels/hidden/component type). We only need to
        // requery when the query text changes; UI-only fields are read
        // directly from the Grid by the view. Debounce keeps rapid typing
        // from thrashing PGlite.
        for (const event of events) {
            if (event.target === this.grid.entry && event.changes.keys.has("query")) {
                this.scheduleRequery();
                return;
            }
        }
    };

    constructor(options: GridRunnerOptions) {
        this.grid = options.grid;
        this.sourceAdapter = options.sourceAdapter;
        this.registry = options.registry ?? options.sourceAdapter.relationRegistry;
    }

    /**
     * Subscribe a view. The latest known result is replayed immediately so a
     * view mounted after the runner started still renders the current result.
     */
    subscribe(callbacks: GridRunnerCallbacks): () => void {
        this.listeners.add(callbacks);
        callbacks.onResult?.(this.lastResult);
        callbacks.onError?.(this.lastError);
        return () => {
            this.listeners.delete(callbacks);
        };
    }

    start(): void {
        if (this.started || this.disposed) return;
        this.started = true;
        this.grid.entry.observeDeep(this.gridObserver);
        this.unsubscribeSource = this.sourceAdapter.subscribe({
            onSchemaChanged: () => this.scheduleRequery(),
            onDataApplied: () => this.scheduleRequery(),
        });
        this.scheduleRequery();
    }

    dispose(): void {
        this.disposed = true;
        if (this.requeryTimer !== undefined) clearTimeout(this.requeryTimer);
        this.requeryTimer = undefined;
        if (this.started) {
            this.grid.entry.unobserveDeep(this.gridObserver);
            this.unsubscribeSource?.();
        }
    }

    /** Debounced re-run of the Grid query. */
    scheduleRequery(): void {
        if (this.disposed) return;
        if (this.requeryTimer !== undefined) clearTimeout(this.requeryTimer);
        this.requeryTimer = setTimeout(() => {
            this.requeryTimer = undefined;
            void this.runQueryNow();
        }, REQUERY_DEBOUNCE_MS);
    }

    async runQueryNow(): Promise<TableQueryResult | undefined> {
        const generation = ++this.queryGeneration;
        const isStale = () => this.disposed || generation !== this.queryGeneration;

        if (isStale()) return undefined;
        const query = getGridQuery(this.grid).trim();
        if (!query) {
            const empty: TableQueryResult = { columns: [], rows: [] };
            this.emitResult(empty);
            this.emitError(undefined);
            return empty;
        }
        try {
            const result = await executeGridQuery(query, {
                pgSchema: this.sourceAdapter.sharedPgSchema,
                registry: this.registry,
                isStale,
            });
            if (isStale()) return undefined;
            this.emitError(undefined);
            this.emitResult(result);
            return result;
        } catch (err) {
            if (isStale()) return undefined;
            const e = err instanceof TableSqlError ? err : toTableSqlError("query", err);
            this.emitError(e.message);
            logger.debug({ err: e }, "[gridQueryRunner] query failed");
            return undefined;
        }
    }

    private emitResult(result: TableQueryResult): void {
        this.lastResult = result;
        for (const l of this.listeners) l.onResult?.(result);
    }

    private emitError(message: string | undefined): void {
        this.lastError = message;
        for (const l of this.listeners) l.onError?.(message);
    }
}
