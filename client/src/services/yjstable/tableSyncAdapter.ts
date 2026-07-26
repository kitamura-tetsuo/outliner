// One-way Yjs -> PGlite synchronization for a single table subdoc.
//
// Data Storage (Y.Map of records) is the source of truth. The adapter
// observes it (observeDeep), casts changed record values strictly according
// to the applied schema, and applies them to PGlite with parameterized
// statements. Failures (cast errors, constraint violations) are collected per
// record and surfaced to the UI; the failing record is not reflected in
// PGlite while other records keep syncing. Query re-runs are debounced.
//
// Every table of a project lives in one shared Postgres schema, so a query may
// reference sibling tables by their plain SQL name and Postgres resolves the
// join itself. Relations that are not materialized yet are reported by the
// engine as `relation "x" does not exist`; the adapter asks the registry port
// to materialize them and retries, so a cross-table result is either complete
// or an error — never a silently partial one.

import type { PGlite } from "@electric-sql/pglite";
import * as Y from "yjs";
import { enqueueWrite, TableSqlError, toTableSqlError } from "./pgliteService";
import { assertSelectQuery, missingRelationName } from "./queryAnalysis";
import { diffSchemas, parseCreateTable, type ParsedTableSchema, type SchemaDiff } from "./schemaIntrospection";
import { quoteIdent } from "./sqlNames";
import { ADAPTER_ORIGIN, deleteColumnData, setSchemaText, type TableHandles, type TableRecord } from "./tableDocs";
import { castValueForColumn } from "./valueCasting";

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
    onQueryResult?: (result: TableQueryResult) => void;
    onQueryError?: (message: string | undefined) => void;
    onRecordErrors?: (errors: RecordSyncError[]) => void;
}

export const REQUERY_DEBOUNCE_MS = 200;

/** Upper bound on materialize-and-retry rounds for one query execution. */
export const MAX_RELATION_RESOLUTION_ROUNDS = 16;

/**
 * The project-level context an adapter needs but must not reach for itself:
 * name uniqueness, publishing the applied SQL name, and materializing sibling
 * tables a query references.
 */
export interface TableRegistryPort {
    /** Message when another table of the project already uses `sqlName`. */
    checkSqlNameConflict?(tableId: string, sqlName: string): string | undefined;
    /** Publish the identifier of the schema that was just applied. */
    recordSqlName?(tableId: string, sqlName: string): void;
    /**
     * Load and materialize a sibling table into the shared schema. Resolves
     * true when the relation is now available, false when the project has no
     * table with that name.
     */
    materializeRelation?(sqlName: string): Promise<boolean>;
}

export interface TableSyncOptions {
    /** Shared Postgres schema holding every table of the project. */
    pgSchema: string;
    registry?: TableRegistryPort;
}

export class TableSyncAdapter {
    private readonly handles: TableHandles;
    private readonly listeners = new Set<TableSyncCallbacks>();
    private readonly pgSchema: string;
    private readonly registry: TableRegistryPort | undefined;
    // Last emitted state, replayed to late subscribers so a view mounted after
    // the adapter started still renders the current result.
    private lastSchemaError: string | undefined;
    private lastResult: TableQueryResult = { columns: [], rows: [] };
    private lastQueryError: string | undefined;
    private lastRecordErrors: RecordSyncError[] = [];
    private schema: ParsedTableSchema | undefined;
    private recordErrors = new Map<string, RecordSyncError[]>();
    private pendingRecordIds = new Set<string>();
    private flushScheduled = false;
    private requeryTimer: ReturnType<typeof setTimeout> | undefined;
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

    private readonly uiObserver = (events: Y.YEvent<Y.AbstractType<unknown>>[]) => {
        // Re-run the query when the UI Definition's query text changes
        // (local form edits and remote collaborators alike).
        for (const event of events) {
            if (event.target === this.handles.uiDef && event.changes.keys.has("query")) {
                this.scheduleRequery();
                return;
            }
        }
    };

    constructor(handles: TableHandles, options: TableSyncOptions) {
        this.handles = handles;
        this.pgSchema = options.pgSchema;
        this.registry = options.registry;
    }

    get appliedSchema(): ParsedTableSchema | undefined {
        return this.schema;
    }

    /**
     * Register a view. The current state is replayed immediately so several
     * views of the same table (an embedded block and the standalone page, for
     * example) share one materialization instead of racing over it.
     */
    subscribe(callbacks: TableSyncCallbacks): () => void {
        this.listeners.add(callbacks);
        callbacks.onSchemaChanged?.(this.schema, this.lastSchemaError);
        callbacks.onQueryResult?.(this.lastResult);
        callbacks.onQueryError?.(this.lastQueryError);
        callbacks.onRecordErrors?.(this.lastRecordErrors);
        return () => {
            this.listeners.delete(callbacks);
        };
    }

    private emitSchema(schema: ParsedTableSchema | undefined, error?: string): void {
        this.lastSchemaError = error;
        for (const l of this.listeners) l.onSchemaChanged?.(schema, error);
    }

    private emitResult(result: TableQueryResult): void {
        this.lastResult = result;
        for (const l of this.listeners) l.onQueryResult?.(result);
    }

    private emitQueryError(message: string | undefined): void {
        this.lastQueryError = message;
        for (const l of this.listeners) l.onQueryError?.(message);
    }

    /** Parse the current schema text, build the PGlite table, load every record. */
    async start(): Promise<void> {
        if (this.started) return;
        this.started = true;
        this.handles.data.observeDeep(this.dataObserver);
        this.handles.schemaText.observe(this.schemaObserver);
        this.handles.uiDef.observeDeep(this.uiObserver);
        await this.rebuildFromSchemaText();
    }

    dispose(): void {
        this.disposed = true;
        if (this.started) {
            this.handles.data.unobserveDeep(this.dataObserver);
            this.handles.schemaText.unobserve(this.schemaObserver);
            this.handles.uiDef.unobserveDeep(this.uiObserver);
        }
        if (this.requeryTimer !== undefined) clearTimeout(this.requeryTimer);
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
        const conflict = this.registry?.checkSqlNameConflict?.(this.handles.tableId, parsed.tableName);
        if (conflict) throw new TableSqlError("schema", conflict);
        return { parsed, diff: diffSchemas(this.schema, parsed) };
    }

    /**
     * Apply a validated schema: persist it to the Schema Definition Y.Text,
     * delete the data of removed columns from Data Storage (already confirmed
     * by the caller), rebuild the PGlite table and reload every record.
     */
    async applySchema(parsed: ParsedTableSchema): Promise<void> {
        const conflict = this.registry?.checkSqlNameConflict?.(this.handles.tableId, parsed.tableName);
        if (conflict) throw new TableSqlError("schema", conflict);
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
        });

        if (this.disposed) return;
        this.registry?.recordSqlName?.(this.handles.tableId, parsed.tableName);
        this.emitSchema(parsed);
        this.emitRecordErrors();
        this.scheduleRequery();
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
            }).then(() => {
                if (this.disposed) return;
                this.emitRecordErrors();
                this.scheduleRequery();
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

    // ------------------------------------------------------------------
    // Query execution (debounced)
    // ------------------------------------------------------------------

    /** Debounced re-run of the UI Definition query. */
    scheduleRequery(): void {
        if (this.requeryTimer !== undefined) clearTimeout(this.requeryTimer);
        this.requeryTimer = setTimeout(() => {
            this.requeryTimer = undefined;
            void this.runQueryNow();
        }, REQUERY_DEBOUNCE_MS);
    }

    /**
     * Run the UI Definition query immediately against the project schema.
     *
     * Relations the query references but that are not materialized yet make
     * Postgres raise `relation "x" does not exist`; rather than parsing the
     * SQL ourselves we let the engine name the missing relation, materialize
     * it through the registry port and retry. Postgres stays the single
     * authority on what the query actually references (CTEs and aliases
     * included).
     */
    async runQueryNow(): Promise<TableQueryResult | undefined> {
        if (this.disposed) return undefined;
        const query = String(this.handles.uiDef.get("query") ?? "").trim();
        if (!query || !this.schema) {
            const empty = { columns: [], rows: [] };
            this.emitQueryError(undefined);
            this.emitResult(empty);
            return empty;
        }
        try {
            const selectSql = assertSelectQuery(query);
            let result: TableQueryResult | undefined;
            for (let round = 0;; round++) {
                try {
                    result = await this.executeQuery(selectSql);
                    break;
                } catch (err) {
                    const relation = missingRelationName(err);
                    if (
                        !relation
                        || !this.registry?.materializeRelation
                        || round >= MAX_RELATION_RESOLUTION_ROUNDS
                    ) throw err;
                    // Resolving runs its own writes, so it must happen outside
                    // the execution lock the query itself holds.
                    if (!await this.registry.materializeRelation(relation)) throw err;
                    if (this.disposed) return undefined;
                }
            }
            if (this.disposed) return undefined;
            this.emitQueryError(undefined);
            this.emitResult(result);
            return result;
        } catch (err) {
            if (this.disposed) return undefined;
            const e = err instanceof TableSqlError ? err : toTableSqlError("query", err);
            this.emitQueryError(e.message);
            return undefined;
        }
    }

    private async executeQuery(selectSql: string): Promise<TableQueryResult> {
        // The write queue doubles as an execution lock so the SET LOCAL
        // search_path transaction never interleaves with other statements.
        return await enqueueWrite(async (db) => {
            try {
                await db.exec(`BEGIN; SET LOCAL search_path TO ${quoteIdent(this.pgSchema)};`);
                const res = await db.query<Record<string, unknown>>(selectSql);
                await db.exec("COMMIT");

                const DATE_OID = 1082;
                const TIMESTAMP_OID = 1114;
                const TIMESTAMPTZ_OID = 1184;
                const dateFields = new Set(res.fields.filter(f => f.dataTypeID === DATE_OID).map(f => f.name));
                const tsNoTzFields = new Set(
                    res.fields.filter(f => f.dataTypeID === TIMESTAMP_OID).map(f => f.name),
                );
                const tsTzFields = new Set(
                    res.fields.filter(f => f.dataTypeID === TIMESTAMPTZ_OID).map(f => f.name),
                );
                const pad = (n: number) => String(n).padStart(2, "0");

                const rows = res.rows.map((row) => {
                    const newRow = { ...row };
                    for (const [key, value] of Object.entries(newRow)) {
                        if (value instanceof Date) {
                            if (dateFields.has(key)) {
                                newRow[key] = `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${
                                    pad(value.getUTCDate())
                                }`;
                            } else if (tsNoTzFields.has(key)) {
                                newRow[key] = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${
                                    pad(value.getDate())
                                }T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}.${
                                    String(value.getMilliseconds()).padStart(3, "0")
                                }Z`;
                            } else if (tsTzFields.has(key)) {
                                newRow[key] = value.toISOString();
                            }
                        }
                    }
                    return newRow;
                });

                return {
                    columns: res.fields.map((f) => f.name),
                    rows,
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
    }
}
