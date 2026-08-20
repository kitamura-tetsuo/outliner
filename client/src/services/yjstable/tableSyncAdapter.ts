// One-way Yjs -> PGlite synchronization for a single Table subdoc.
//
// Data Storage (Y.Map of records) is the source of truth. The adapter
// observes it (observeDeep), casts changed record values strictly according
// to the applied schema, and applies them to PGlite with parameterized
// statements. Failures (cast errors, constraint violations) are collected per
// record and surfaced to the UI; the failing record is not reflected in
// PGlite while other records keep syncing.
//
// The adapter is Table-centric: it does NOT own a SELECT/query. Grids that
// present the Table hold their own query text (see gridDocs) and drive their
// own re-run through the shared query helper (`executeGridQuery`) whenever
// this adapter emits an `onDataApplied` or `onSchemaChanged` event.
//
// Every Table of a project lives in one shared Postgres schema, so a query may
// reference sibling Tables by their plain SQL name and Postgres resolves the
// join itself. Relations that are not materialized yet are reported by the
// engine as `relation "x" does not exist`; the shared query helper asks the
// registry port to resolve them into relation providers and retries, so a
// cross-relation result is either complete or an error — never silently partial.

import type { PGlite } from "@electric-sql/pglite";
import * as Y from "yjs";
import { getLogger } from "../../lib/logger";
import { enqueueWrite, TableSqlError, toTableSqlError } from "./pgliteService";
import { assertSelectQuery, missingRelationName } from "./queryAnalysis";
import { formatQueryDateFields } from "./queryResultFormatting";
import type { RelationProvider } from "./relationProvider";
import { diffSchemas, parseCreateTable, type ParsedTableSchema, type SchemaDiff } from "./schemaIntrospection";
import { quoteIdent, reservedRelationNameError } from "./sqlNames";
import { ADAPTER_ORIGIN, deleteColumnData, setSchemaText, type TableHandles, type TableRecord } from "./tableDocs";
import { castValueForColumn } from "./valueCasting";

const logger = getLogger("tableSyncAdapter");

export interface RecordSyncError {
    recordId: string;
    column?: string;
    message: string;
}

export interface TableQueryResult {
    columns: string[];
    rows: Record<string, unknown>[];
}

export interface TableSyncCallbacks {
    /** Fired whenever the applied schema changes (undefined = none/invalid). */
    onSchemaChanged?: (schema: ParsedTableSchema | undefined, error?: string) => void;
    onRecordErrors?: (errors: RecordSyncError[]) => void;
    /**
     * Fired whenever a batch of pending record writes finished (or when the
     * schema was just rebuilt and all records reloaded). Grid query runners
     * subscribe to this to know when to re-run their SELECT.
     */
    onDataApplied?: () => void;
    /**
     * Legacy: query results used to be emitted by the adapter itself. Grids
     * now own their SELECT via `GridQueryRunner`; these fields are accepted
     * only so pre-split tests keep compiling and receive `runQueryNow` output
     * on demand.
     */
    onQueryResult?: (result: TableQueryResult) => void;
    onQueryError?: (message: string | undefined) => void;
}

export const REQUERY_DEBOUNCE_MS = 200;

/** Upper bound on materialize-and-retry rounds for one query execution. */
export const MAX_RELATION_RESOLUTION_ROUNDS = 16;

/**
 * The project-level context an adapter needs but must not reach for itself:
 * name uniqueness, publishing the applied SQL name, and materializing the
 * sibling relations a query references.
 *
 * Sibling relations are resolved as `RelationProvider`s rather than as tables:
 * a query may reference another table's Data Storage or the system `items`
 * projection, and from here they are the same thing — a relation that can be
 * materialized into the shared schema and written back to.
 */
export interface RelationRegistryPort {
    /** Message when another table of the project already uses `sqlName`. */
    checkSqlNameConflict?(tableId: string, sqlName: string): string | undefined;
    /** Publish the identifier of the schema that was just applied. */
    recordSqlName?(tableId: string, sqlName: string): void;
    /**
     * Resolve the provider of a relation a query referenced and materialize it
     * into the shared schema. Resolves undefined when the project has no
     * relation with that name.
     */
    resolveRelation?(sqlName: string): Promise<RelationProvider | undefined>;
}

export interface TableSyncOptions {
    /** Shared Postgres schema holding every table of the project. */
    pgSchema: string;
    registry?: RelationRegistryPort;
}

export class TableSyncAdapter {
    private readonly handles: TableHandles;
    private readonly listeners = new Set<TableSyncCallbacks>();
    private readonly pgSchema: string;
    private readonly registry: RelationRegistryPort | undefined;
    // Last emitted state, replayed to late subscribers so a view mounted after
    // the adapter started still renders the current result.
    private lastSchemaError: string | undefined;
    private lastRecordErrors: RecordSyncError[] = [];
    private schema: ParsedTableSchema | undefined;
    private recordErrors = new Map<string, RecordSyncError[]>();
    private pendingRecordIds = new Set<string>();
    private flushScheduled = false;
    private disposed = false;
    private started = false;

    private readonly dataObserver = (
        events: Y.YEvent<Y.AbstractType<unknown>>[],
        tr: Y.Transaction,
    ) => {
        if (tr.origin === ADAPTER_ORIGIN) return;
        for (const event of events) {
            if (event.target === this.handles.data) {
                for (const key of event.changes.keys.keys()) {
                    this.pendingRecordIds.add(key);
                }
            } else if (event.path.length > 0) {
                this.pendingRecordIds.add(String(event.path[0]));
            }
        }
        this.scheduleFlush();
    };

    private readonly schemaObserver = (_event: Y.YTextEvent, tr: Y.Transaction) => {
        if (tr.origin === ADAPTER_ORIGIN) return;
        void this.rebuildFromSchemaText();
    };

    constructor(handles: TableHandles, options: TableSyncOptions) {
        this.handles = handles;
        this.pgSchema = options.pgSchema;
        this.registry = options.registry;
    }

    get appliedSchema(): ParsedTableSchema | undefined {
        return this.schema;
    }

    get sharedPgSchema(): string {
        return this.pgSchema;
    }

    get relationRegistry(): RelationRegistryPort | undefined {
        return this.registry;
    }

    // Kept only so the legacy `runQueryNow` shim can replay the last result to
    // a late subscriber the way the pre-split adapter did. Grid runners hold
    // their own cached result and don't depend on this.
    private lastLegacyQueryResult: TableQueryResult | undefined;
    private lastLegacyQueryError: string | undefined;

    /**
     * Register a view. The current state is replayed immediately so several
     * views of the same table share one materialization instead of racing.
     */
    subscribe(callbacks: TableSyncCallbacks): () => void {
        this.listeners.add(callbacks);
        callbacks.onSchemaChanged?.(this.schema, this.lastSchemaError);
        callbacks.onRecordErrors?.(this.lastRecordErrors);
        // Replay the last ad-hoc query result to keep pre-split subscribers
        // rendering the same rows they used to see after mounting.
        if (this.lastLegacyQueryResult !== undefined) {
            callbacks.onQueryResult?.(this.lastLegacyQueryResult);
        }
        if (this.lastLegacyQueryError !== undefined) {
            callbacks.onQueryError?.(this.lastLegacyQueryError);
        }
        return () => {
            this.listeners.delete(callbacks);
        };
    }

    private emitSchema(schema: ParsedTableSchema | undefined, error?: string): void {
        this.lastSchemaError = error;
        for (const l of this.listeners) l.onSchemaChanged?.(schema, error);
    }

    private emitDataApplied(): void {
        for (const l of this.listeners) l.onDataApplied?.();
    }

    /** Parse the current schema text, build the PGlite table, load every record. */
    async start(): Promise<void> {
        // Disposed before it ever started: the entry that owned this adapter
        // was released while its connection was still being set up, and
        // observing a table nobody will read is pure leak.
        if (this.started || this.disposed) return;
        this.started = true;
        this.handles.data.observeDeep(this.dataObserver);
        this.handles.schemaText.observe(this.schemaObserver);
        await this.rebuildFromSchemaText();
    }

    dispose(): void {
        this.disposed = true;
        if (this.started) {
            this.handles.data.unobserveDeep(this.dataObserver);
            this.handles.schemaText.unobserve(this.schemaObserver);
        }
    }

    private queryGeneration = 0;

    /**
     * Test-only convenience: run an ad-hoc SELECT against the shared project
     * schema, resolving referenced relations exactly like a Grid runner would.
     * Production code goes through `GridQueryRunner` (which owns the Grid state
     * and debouncing); this shim keeps small adapter tests from having to spin
     * up a Grid entry just to execute one query, and it emits `onQueryResult`
     * / `onQueryError` to subscribed listeners so their tests can observe the
     * outcome as if the adapter still owned the query lifecycle.
     */
    async runQueryNow(explicitQuery?: string): Promise<TableQueryResult | undefined> {
        // Legacy tests seed a query through the Table subdoc's "ui" map that
        // predates the Grid registry. Fall back to that when nothing explicit
        // was passed so those tests keep exercising the same paths.
        let query = explicitQuery;
        if (query === undefined) {
            const legacy = this.handles.doc.getMap<unknown>("ui").get("query");
            query = typeof legacy === "string" ? legacy : "";
        }
        const generation = ++this.queryGeneration;
        const isStale = () => this.disposed || generation !== this.queryGeneration;
        if (!query.trim() || !this.schema) {
            const empty: TableQueryResult = { columns: [], rows: [] };
            if (!isStale()) {
                this.lastLegacyQueryError = undefined;
                this.lastLegacyQueryResult = empty;
                for (const l of this.listeners) l.onQueryError?.(undefined);
                for (const l of this.listeners) l.onQueryResult?.(empty);
            }
            return empty;
        }
        try {
            const result = await executeGridQuery(query, {
                pgSchema: this.pgSchema,
                registry: this.registry,
                isStale,
            });
            if (isStale()) return undefined;
            this.lastLegacyQueryError = undefined;
            this.lastLegacyQueryResult = result;
            for (const l of this.listeners) l.onQueryError?.(undefined);
            for (const l of this.listeners) l.onQueryResult?.(result);
            return result;
        } catch (err) {
            if (isStale()) return undefined;
            const e = err instanceof TableSqlError ? err : toTableSqlError("query", err);
            this.lastLegacyQueryError = e.message;
            for (const l of this.listeners) l.onQueryError?.(e.message);
            return undefined;
        }
    }

    // ------------------------------------------------------------------
    // Schema application
    // ------------------------------------------------------------------

    /**
     * Validate a schema draft and report what applying it would destroy.
     * The UI shows a warning dialog when the diff removes columns or changes
     * types; nothing is written yet.
     */
    async prepareSchemaChange(sql: string): Promise<{ parsed: ParsedTableSchema; diff: SchemaDiff; }> {
        const parsed = await parseCreateTable(sql);
        this.assertNameAvailable(parsed.tableName);
        return { parsed, diff: diffSchemas(this.schema, parsed) };
    }

    /**
     * A table name must be free of both kinds of clash: another table of the
     * project, and a system-defined relation nobody authors. The reserved
     * check does not go through the registry — it holds for every adapter,
     * with or without a project context.
     */
    private assertNameAvailable(tableName: string): void {
        const reserved = reservedRelationNameError(tableName);
        if (reserved) throw new TableSqlError("schema", reserved);
        const conflict = this.registry?.checkSqlNameConflict?.(this.handles.tableId, tableName);
        if (conflict) throw new TableSqlError("schema", conflict);
    }

    /**
     * Apply a validated schema: persist it to the Schema Definition Y.Text,
     * delete the data of removed columns from Data Storage (already confirmed
     * by the caller), rebuild the PGlite table and reload every record.
     */
    async applySchema(parsed: ParsedTableSchema): Promise<void> {
        this.assertNameAvailable(parsed.tableName);
        const diff = diffSchemas(this.schema, parsed);
        this.handles.doc.transact(() => {
            setSchemaText(this.handles, parsed.createSql);
            if (diff.removedColumns.length > 0) {
                deleteColumnData(this.handles, diff.removedColumns);
            }
        }, ADAPTER_ORIGIN);
        await this.rebuild(parsed);
    }

    private async rebuildFromSchemaText(): Promise<void> {
        const sql = this.handles.schemaText.toString().trim();
        if (!sql) {
            this.schema = undefined;
            this.emitSchema(undefined);
            return;
        }
        try {
            const parsed = await parseCreateTable(sql);
            // Also checked here, not only on apply: the schema text may arrive
            // from another client, and a reserved name must never shadow the
            // system relation of the same name.
            const reserved = reservedRelationNameError(parsed.tableName);
            if (reserved) throw new TableSqlError("schema", reserved);
            await this.rebuild(parsed);
        } catch (err) {
            this.schema = undefined;
            const message = err instanceof Error ? err.message : String(err);
            this.emitSchema(undefined, message);
        }
    }

    private async rebuild(parsed: ParsedTableSchema): Promise<void> {
        // Only this table's relation is dropped: the schema is shared with
        // every other table of the project. A renamed table also drops the
        // relation it used to own, so the old name stops resolving.
        const previousTableName = this.schema?.tableName;
        this.schema = parsed;
        this.recordErrors = new Map();
        const recordIds: string[] = [];
        this.handles.data.forEach((_record, recordId) => {
            recordIds.push(recordId);
        });

        await enqueueWrite(async (db) => {
            await db.exec(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(this.pgSchema)};`);
            if (previousTableName && previousTableName !== parsed.tableName) {
                await db.exec(
                    `DROP TABLE IF EXISTS ${quoteIdent(this.pgSchema)}.${quoteIdent(previousTableName)} CASCADE;`,
                );
            }
            await db.exec(
                `DROP TABLE IF EXISTS ${quoteIdent(this.pgSchema)}.${quoteIdent(parsed.tableName)} CASCADE;`,
            );
            try {
                await db.exec(
                    `BEGIN; SET LOCAL search_path TO ${quoteIdent(this.pgSchema)}; ${parsed.createSql}; COMMIT;`,
                );
            } catch (err) {
                try {
                    await db.exec("ROLLBACK;");
                } catch {
                    // no transaction to roll back
                }
                throw toTableSqlError("schema", err);
            }
            for (const recordId of recordIds) {
                await this.applyRecordToDb(db, recordId);
            }
        }).catch(err => {
            logger.warn({ err }, "[tableSyncAdapter] Rebuild write queue operation failed");
        });

        if (this.disposed) return;
        this.registry?.recordSqlName?.(this.handles.tableId, parsed.tableName);
        this.emitSchema(parsed);
        this.emitRecordErrors();
        this.emitDataApplied();
    }

    // ------------------------------------------------------------------
    // Record synchronization
    // ------------------------------------------------------------------

    private scheduleFlush(): void {
        if (this.flushScheduled) return;
        this.flushScheduled = true;
        queueMicrotask(() => {
            this.flushScheduled = false;
            if (this.disposed) return;
            const ids = [...this.pendingRecordIds];
            this.pendingRecordIds.clear();
            if (ids.length === 0 || !this.schema) return;
            // Without an id column rows cannot be addressed individually, so
            // an incremental delete+insert would duplicate rows: reload all
            // records instead.
            const hasIdColumn = this.schema.columns.some((c) => c.name === "id");
            void enqueueWrite(async (db) => {
                if (!hasIdColumn) {
                    await this.reloadAllRecords(db);
                    return;
                }
                for (const recordId of ids) {
                    await this.applyRecordToDb(db, recordId);
                }
            }).catch(err => {
                logger.warn({ err }, "[tableSyncAdapter] Flush write queue operation failed");
            }).then(() => {
                if (this.disposed) return;
                this.emitRecordErrors();
                this.emitDataApplied();
            });
        });
    }

    /** Truncate the table and re-insert every record (id-less schemas). */
    private async reloadAllRecords(db: PGlite): Promise<void> {
        const schema = this.schema;
        if (!schema) return;
        const table = `${quoteIdent(this.pgSchema)}.${quoteIdent(schema.tableName)}`;
        try {
            await db.query(`DELETE FROM ${table}`);
        } catch {
            return;
        }
        this.recordErrors = new Map();
        const recordIds: string[] = [];
        this.handles.data.forEach((_record, recordId) => {
            recordIds.push(recordId);
        });
        for (const recordId of recordIds) {
            await this.applyRecordToDb(db, recordId);
        }
    }

    /**
     * Apply one record's current Yjs state to PGlite (delete + insert inside a
     * transaction). On any failure the transaction is rolled back so the
     * record's previous state stays in place, the error is recorded, and other
     * records continue to sync.
     */
    private async applyRecordToDb(db: PGlite, recordId: string): Promise<void> {
        const schema = this.schema;
        if (!schema) return;
        const table = `${quoteIdent(this.pgSchema)}.${quoteIdent(schema.tableName)}`;
        const record = this.handles.data.get(recordId) as TableRecord | undefined;
        const hasIdColumn = schema.columns.some((c) => c.name === "id");

        if (!record) {
            this.recordErrors.delete(recordId);
            if (hasIdColumn) {
                await db.query(`DELETE FROM ${table} WHERE "id" = $1`, [recordId]);
            }
            return;
        }

        const errors: RecordSyncError[] = [];
        const columns: string[] = [];
        const values: unknown[] = [];
        for (const column of schema.columns) {
            const raw = column.name === "id" ? recordId : record.get(column.name);
            try {
                columns.push(column.name);
                values.push(castValueForColumn(raw, column));
            } catch (err) {
                columns.pop();
                const e = toTableSqlError("cast", err, { recordId, column: column.name });
                errors.push({ recordId, column: e.column, message: e.message });
            }
        }

        if (errors.length > 0) {
            this.recordErrors.set(recordId, errors);
            return;
        }

        try {
            await db.exec("BEGIN");
            if (hasIdColumn) {
                await db.query(`DELETE FROM ${table} WHERE "id" = $1`, [recordId]);
            }
            const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
            await db.query(
                `INSERT INTO ${table} (${columns.map(quoteIdent).join(", ")}) VALUES (${placeholders})`,
                values,
            );
            await db.exec("COMMIT");
            this.recordErrors.delete(recordId);
        } catch (err) {
            try {
                await db.exec("ROLLBACK");
            } catch {
                // no transaction to roll back
            }
            const e = toTableSqlError("write", err, { recordId });
            this.recordErrors.set(recordId, [{ recordId, column: e.column, message: e.message }]);
        }
    }

    private emitRecordErrors(): void {
        const flat: RecordSyncError[] = [];
        for (const errors of this.recordErrors.values()) flat.push(...errors);
        this.lastRecordErrors = flat;
        for (const l of this.listeners) l.onRecordErrors?.(flat);
    }
}

/**
 * Run a SELECT against the shared project Postgres schema, with the same
 * materialize-and-retry behavior the old adapter used for cross-relation
 * queries. Grid runners call this to execute their own SELECT text; the
 * adapter itself no longer owns a query.
 */
export async function executeGridQuery(
    selectQuery: string,
    context: {
        pgSchema: string;
        registry?: RelationRegistryPort;
        isStale?: () => boolean;
    },
): Promise<TableQueryResult> {
    const trimmed = selectQuery.trim();
    if (!trimmed) return { columns: [], rows: [] };
    const selectSql = assertSelectQuery(trimmed);
    for (let round = 0;; round++) {
        try {
            return await enqueueWrite(async (db) => {
                try {
                    await db.exec(`BEGIN; SET LOCAL search_path TO ${quoteIdent(context.pgSchema)};`);
                    const res = await db.query<Record<string, unknown>>(selectSql);
                    await db.exec("COMMIT");
                    return {
                        columns: res.fields.map((f) => f.name),
                        rows: formatQueryDateFields(res.fields, res.rows),
                    };
                } catch (err) {
                    try {
                        await db.exec("ROLLBACK");
                    } catch {
                        // no transaction to roll back
                    }
                    throw toTableSqlError("query", err);
                }
            });
        } catch (err) {
            const relation = missingRelationName(err);
            if (
                !relation
                || !context.registry?.resolveRelation
                || round >= MAX_RELATION_RESOLUTION_ROUNDS
            ) throw err;
            // Resolving runs its own writes, so it must happen outside
            // the execution lock the query itself holds.
            const provider = await context.registry.resolveRelation(relation);
            if (!provider) throw err;
            if (context.isStale?.()) throw err;
        }
    }
}
