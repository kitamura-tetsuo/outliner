// PGlite (in-memory Postgres) engine shared by every Yjs table block.
//
// - The module is imported dynamically by the table feature only, so PGlite's
//   WASM bundle is never loaded on screens that do not use tables.
// - Initialization is a single shared promise: concurrent callers all await
//   the same PGlite instance.
// - PGlite runs every statement asynchronously, so all mutating statements go
//   through a serialized write queue to keep the one-way Yjs -> PGlite flow
//   deterministic.

import type { PGlite } from "@electric-sql/pglite";

export type TableSqlErrorKind =
    | "init"
    | "schema"
    | "query"
    | "write"
    | "cast";

/** Typed error for every failure surfaced by the Yjs table SQL engine. */
export class TableSqlError extends Error {
    readonly kind: TableSqlErrorKind;
    /** Record id of the Data Storage record the failure belongs to, when applicable. */
    readonly recordId?: string;
    /** Column the failure belongs to, when applicable. */
    readonly column?: string;

    constructor(
        kind: TableSqlErrorKind,
        message: string,
        options: { recordId?: string; column?: string; cause?: unknown; } = {},
    ) {
        super(message, options.cause === undefined ? undefined : { cause: options.cause });
        this.name = "TableSqlError";
        this.kind = kind;
        this.recordId = options.recordId;
        this.column = options.column;
    }
}

export function toTableSqlError(
    kind: TableSqlErrorKind,
    err: unknown,
    context: { recordId?: string; column?: string; } = {},
): TableSqlError {
    if (err instanceof TableSqlError) return err;
    const message = err instanceof Error ? err.message : String(err);
    return new TableSqlError(kind, message, { ...context, cause: err });
}

export interface PgQueryResult<T = Record<string, unknown>> {
    rows: T[];
    fields: { name: string; dataTypeID: number; }[];
}

let initPromise: Promise<PGlite> | undefined;
let writeQueue: Promise<unknown> = Promise.resolve();

/**
 * Lazily create (or reuse) the shared in-memory PGlite instance. The
 * `@electric-sql/pglite` package is imported dynamically so the WASM engine is
 * only downloaded once a table block actually needs it.
 */
export function getPglite(): Promise<PGlite> {
    if (!initPromise) {
        initPromise = (async () => {
            try {
                const { PGlite } = await import("@electric-sql/pglite");
                return new PGlite("memory://");
            } catch (err) {
                // Allow a later retry when the engine failed to load.
                initPromise = undefined;
                throw toTableSqlError("init", err);
            }
        })();
    }
    return initPromise;
}

/** True when some caller already started (or finished) engine initialization. */
export function isPgliteStarted(): boolean {
    return initPromise !== undefined;
}

/**
 * Run a read-only query against the shared engine. Queries do not go through
 * the write queue; PGlite serializes statement execution internally.
 */
export async function runSelect<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
): Promise<PgQueryResult<T>> {
    const db = await getPglite();
    try {
        const res = await db.query<T>(sql, params);
        return {
            rows: res.rows,
            fields: res.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
        };
    } catch (err) {
        throw toTableSqlError("query", err);
    }
}

/**
 * Enqueue a mutating operation. All writes across every table block are
 * serialized through this single queue so DDL and row upserts never interleave.
 * The returned promise settles with the operation's own result/failure; a
 * failure does not break the queue for later writers.
 */
export function enqueueWrite<T>(op: (db: PGlite) => Promise<T>): Promise<T> {
    const run = writeQueue.then(async () => op(await getPglite()));
    writeQueue = run.catch(() => undefined);
    return run;
}

/** Execute a single mutating statement (DDL or DML) through the write queue. */
export function execWrite(sql: string, params: unknown[] = []): Promise<void> {
    return enqueueWrite(async (db) => {
        try {
            await db.query(sql, params);
        } catch (err) {
            throw toTableSqlError("write", err);
        }
    });
}

/**
 * Reset the module singleton. Test-only: unit tests must not leak the engine
 * (or a pending failed init) across test files.
 */
export async function resetPgliteForTests(): Promise<void> {
    const pending = initPromise;
    initPromise = undefined;
    writeQueue = Promise.resolve();
    if (pending) {
        try {
            const db = await pending;
            await db.close();
        } catch {
            // Engine never became usable; nothing to close.
        }
    }
}
