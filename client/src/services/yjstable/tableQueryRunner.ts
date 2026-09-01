// Shared execution machinery for "run a SELECT against a Table's
// materialization and stream the result to a view".
//
// Two subjects need exactly this: a Grid (whose SELECT is authoritative,
// persisted Yjs state — see `GridQueryRunner`) and a Table's own raw-data
// browser (whose SELECT is the implicit, ephemeral `SELECT * FROM <sqlName>`
// — see `RawTableQueryRunner`). The difference between them is only *where the
// query text comes from* and *what invalidates it*, so everything else — the
// debounce, the staleness generation, the schema gate, the listener fan-out —
// lives here once.
//
// Re-execution is debounced around three inputs:
//   - the query text changes            -> `invalidateQuery()` from a subclass.
//   - the source Table's schema changes -> onSchemaChanged from the adapter.
//   - the source Table's data changes   -> onDataApplied from the adapter.

import type * as Y from "yjs";
import { getLogger } from "../../lib/logger";
import { TableSqlError, toTableSqlError } from "./pgliteService";
import { getTableRegistry, getTableSqlName } from "./tableDocs";
import {
    executeGridQuery,
    type RelationRegistryPort,
    REQUERY_DEBOUNCE_MS,
    type TableQueryResult,
    TableSyncAdapter,
} from "./tableSyncAdapter";

const logger = getLogger("tableQueryRunner");

export interface TableRunnerCallbacks {
    onResult?: (result: TableQueryResult, execution?: TableQueryExecution) => void;
    onError?: (message: string | undefined) => void;
}

export interface TableQueryExecution {
    queryId: string;
    generation: number;
    query: string;
    status: "completed" | "skipped";
    startedAt: string;
    durationMs: number;
    rowCount: number;
    columnCount: number;
}

export interface TableRunnerOptions {
    /** The adapter of the source Table (materialization + relation registry). */
    sourceAdapter: TableSyncAdapter;
    /** Optional registry override (defaults to `sourceAdapter.relationRegistry`). */
    registry?: RelationRegistryPort;
}

/**
 * Base runner. Subclasses supply the query text and decide what makes it
 * stale; they must call `invalidateQuery()` when their text changes.
 */
export abstract class TableQueryRunnerBase {
    protected readonly sourceAdapter: TableSyncAdapter;
    private readonly registry: RelationRegistryPort | undefined;

    private readonly listeners = new Set<TableRunnerCallbacks>();
    private lastResult: TableQueryResult = { columns: [], rows: [] };
    private lastExecution: TableQueryExecution | undefined;
    private lastError: string | undefined;

    private requeryTimer: ReturnType<typeof setTimeout> | undefined;
    private queryGeneration = 0;
    protected disposed = false;
    private started = false;

    private unsubscribeSource: (() => void) | undefined;

    constructor(options: TableRunnerOptions) {
        this.sourceAdapter = options.sourceAdapter;
        this.registry = options.registry ?? options.sourceAdapter.relationRegistry;
    }

    /** The SELECT to execute right now. */
    protected abstract currentQuery(): string;

    /** Whether this persisted query has opted into the explicit-alias policy. */
    protected requireExplicitAliases(): boolean {
        return true;
    }

    /** Attach whatever observers make `currentQuery()` change over time. */
    protected observeQuerySource(): void {}

    /** Detach the observers `observeQuerySource` attached. */
    protected unobserveQuerySource(): void {}

    /**
     * Subscribe a view. The latest known result is replayed immediately so a
     * view mounted after the runner started still renders the current result.
     */
    subscribe(callbacks: TableRunnerCallbacks): () => void {
        this.listeners.add(callbacks);
        callbacks.onResult?.(this.lastResult, this.lastExecution);
        callbacks.onError?.(this.lastError);
        return () => {
            this.listeners.delete(callbacks);
        };
    }

    start(): void {
        if (this.started || this.disposed) return;
        this.started = true;
        this.observeQuerySource();
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
            this.unobserveQuerySource();
            this.unsubscribeSource?.();
        }
    }

    /** Called by a subclass when its query text changed. */
    protected invalidateQuery(): void {
        this.scheduleRequery();
    }

    /** Debounced re-run of the query. */
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
        const queryId = `query-${generation}`;
        const startedAt = new Date();
        const isStale = () => this.disposed || generation !== this.queryGeneration;

        if (isStale()) return undefined;
        const query = this.currentQuery().trim();
        // The source Table must have a valid applied schema before rows may be
        // presented. When the schema text is cleared or becomes invalid the
        // adapter reports `appliedSchema === undefined` but does NOT drop the
        // previously materialized relation, so running the query anyway would
        // succeed against stale rows and show data whose schema no longer
        // exists. The pre-split adapter gated on exactly this.
        if (!query || !this.sourceAdapter.appliedSchema) {
            const empty: TableQueryResult = { columns: [], rows: [] };
            this.emitResult(empty, executionMetadata(queryId, generation, query, "skipped", startedAt, empty));
            this.emitError(undefined);
            return empty;
        }
        try {
            const result = await executeGridQuery(query, {
                pgSchema: this.sourceAdapter.sharedPgSchema,
                registry: this.registry,
                isStale,
                requireExplicitAliases: this.requireExplicitAliases(),
            });
            if (isStale()) return undefined;
            this.emitError(undefined);
            this.emitResult(result, executionMetadata(queryId, generation, query, "completed", startedAt, result));
            return result;
        } catch (err) {
            if (isStale()) return undefined;
            const e = err instanceof TableSqlError ? err : toTableSqlError("query", err);
            this.emitError(e.message);
            logger.debug({ err: e }, "[tableQueryRunner] query failed");
            return undefined;
        }
    }

    private emitResult(result: TableQueryResult, execution?: TableQueryExecution): void {
        this.lastResult = result;
        this.lastExecution = execution;
        for (const l of this.listeners) l.onResult?.(result, execution);
    }

    private emitError(message: string | undefined): void {
        this.lastError = message;
        for (const l of this.listeners) l.onError?.(message);
    }
}

function executionMetadata(
    queryId: string,
    generation: number,
    query: string,
    status: TableQueryExecution["status"],
    startedAt: Date,
    result: TableQueryResult,
): TableQueryExecution {
    return {
        queryId,
        generation,
        query,
        status,
        startedAt: startedAt.toISOString(),
        durationMs: Math.max(0, Date.now() - startedAt.getTime()),
        rowCount: result.rows.length,
        columnCount: result.columns.length,
    };
}

export interface RawTableRunnerOptions extends TableRunnerOptions {
    /** Project doc holding the Table registry the SQL name is read from. */
    projectDoc: Y.Doc;
    /** The Table whose rows are browsed. */
    tableId: string;
}

/**
 * Runs the implicit `SELECT * FROM <sqlName>` a Table's own raw-data browser
 * shows. The query is derived, never stored: opening a Table must not create
 * or touch any Grid state (issue #5012).
 *
 * The SQL name is read from the Table registry on every run and the registry
 * is observed, so renaming the Table moves the implicit query with it — there
 * is no stored query text that could go stale.
 */
export class RawTableQueryRunner extends TableQueryRunnerBase {
    private readonly projectDoc: Y.Doc;
    private readonly tableId: string;

    private readonly registryObserver = () => this.invalidateQuery();

    constructor(options: RawTableRunnerOptions) {
        super(options);
        this.projectDoc = options.projectDoc;
        this.tableId = options.tableId;
    }

    protected currentQuery(): string {
        return rawTableQuery(getTableSqlName(this.projectDoc, this.tableId) ?? "");
    }

    protected observeQuerySource(): void {
        getTableRegistry(this.projectDoc).observeDeep(this.registryObserver);
    }

    protected unobserveQuerySource(): void {
        getTableRegistry(this.projectDoc).unobserveDeep(this.registryObserver);
    }
}

/** The implicit SELECT a Table's raw-data browser runs. Never persisted. */
export function rawTableQuery(sqlName: string): string {
    if (!sqlName) return "";
    // Unquoted: a Table's SQL name is already validated to be a bare
    // identifier (`sqlNames.ts`), and quoting it here would diverge from the
    // text a Grid's default query carries for the same Table.
    return `SELECT * FROM ${sqlName}`;
}
