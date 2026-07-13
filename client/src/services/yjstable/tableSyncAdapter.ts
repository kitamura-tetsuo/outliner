// One-way Yjs -> PGlite synchronization for a single table subdoc.
//
// Data Storage (Y.Map of records) is the source of truth. The adapter
// observes it (observeDeep), casts changed record values strictly according
// to the applied schema, and applies them to PGlite with parameterized
// statements. Failures (cast errors, constraint violations) are collected per
// record and surfaced to the UI; the failing record is not reflected in
// PGlite while other records keep syncing. Query re-runs are debounced.

import * as Y from "yjs";
import type { PGlite } from "@electric-sql/pglite";
import { enqueueWrite, TableSqlError, toTableSqlError } from "./pgliteService";
import { assertSelectQuery } from "./queryAnalysis";
import {
    diffSchemas,
    type ParsedTableSchema,
    parseCreateTable,
    type SchemaDiff,
} from "./schemaIntrospection";
import { deleteColumnData, setSchemaText, type TableHandles, type TableRecord } from "./tableDocs";
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

function pgSchemaName(tableId: string): string {
    return `t_${tableId.replace(/-/g, "_")}`;
}

function quoteIdent(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
}

export class TableSyncAdapter {
    private readonly handles: TableHandles;
    private readonly callbacks: TableSyncCallbacks;
    private readonly pgSchema: string;
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
        if (tr.origin === this) return;
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
        if (tr.origin === this) return;
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

    constructor(handles: TableHandles, callbacks: TableSyncCallbacks = {}) {
        this.handles = handles;
        this.callbacks = callbacks;
        this.pgSchema = pgSchemaName(handles.tableId);
    }

    get appliedSchema(): ParsedTableSchema | undefined {
        return this.schema;
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
        return { parsed, diff: diffSchemas(this.schema, parsed) };
    }

    /**
     * Apply a validated schema: persist it to the Schema Definition Y.Text,
     * delete the data of removed columns from Data Storage (already confirmed
     * by the caller), rebuild the PGlite table and reload every record.
     */
    async applySchema(parsed: ParsedTableSchema): Promise<void> {
        const diff = diffSchemas(this.schema, parsed);
        setSchemaText(this.handles, parsed.createSql, this);
        if (diff.removedColumns.length > 0) {
            deleteColumnData(this.handles, diff.removedColumns, this);
        }
        await this.rebuild(parsed);
    }

    private async rebuildFromSchemaText(): Promise<void> {
        const sql = this.handles.schemaText.toString().trim();
        if (!sql) {
            this.schema = undefined;
            this.callbacks.onSchemaChanged?.(undefined);
            return;
        }
        try {
            const parsed = await parseCreateTable(sql);
            await this.rebuild(parsed);
        } catch (err) {
            this.schema = undefined;
            const message = err instanceof Error ? err.message : String(err);
            this.callbacks.onSchemaChanged?.(undefined, message);
        }
    }

    private async rebuild(parsed: ParsedTableSchema): Promise<void> {
        this.schema = parsed;
        this.recordErrors = new Map();
        const recordIds: string[] = [];
        this.handles.data.forEach((_record, recordId) => {
            recordIds.push(recordId);
        });

        await enqueueWrite(async (db) => {
            await db.exec(`DROP SCHEMA IF EXISTS ${quoteIdent(this.pgSchema)} CASCADE;`);
            await db.exec(`CREATE SCHEMA ${quoteIdent(this.pgSchema)};`);
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
        this.callbacks.onSchemaChanged?.(parsed);
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
            void enqueueWrite(async (db) => {
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
        this.callbacks.onRecordErrors?.(flat);
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

    /** Run the UI Definition query immediately, scoped to this table's schema. */
    async runQueryNow(): Promise<TableQueryResult | undefined> {
        if (this.disposed) return undefined;
        const query = String(this.handles.uiDef.get("query") ?? "").trim();
        if (!query || !this.schema) {
            const empty = { columns: [], rows: [] };
            this.callbacks.onQueryError?.(undefined);
            this.callbacks.onQueryResult?.(empty);
            return empty;
        }
        try {
            const selectSql = assertSelectQuery(query);
            // The write queue doubles as an execution lock so the SET LOCAL
            // search_path transaction never interleaves with other statements.
            const result = await enqueueWrite(async (db) => {
                try {
                    await db.exec(`BEGIN; SET LOCAL search_path TO ${quoteIdent(this.pgSchema)};`);
                    const res = await db.query<Record<string, unknown>>(selectSql);
                    await db.exec("COMMIT");
                    return {
                        columns: res.fields.map((f) => f.name),
                        rows: res.rows,
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
            if (this.disposed) return undefined;
            this.callbacks.onQueryError?.(undefined);
            this.callbacks.onQueryResult?.(result);
            return result;
        } catch (err) {
            if (this.disposed) return undefined;
            const e = err instanceof TableSqlError ? err : toTableSqlError("query", err);
            this.callbacks.onQueryError?.(e.message);
            return undefined;
        }
    }
}
