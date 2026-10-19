// The table side of the relation provider interface.
//
// A table row is a record of the table's own Data Storage `Y.Map`, addressed
// by record id, so the inverse mapping is direct and every write operation is
// accepted without a decision from the caller. Materialization is whatever the
// sync adapter already did: the adapter builds the relation from the applied
// schema, and this provider only reports whether that succeeded.

import {
    assertWriteAllowed,
    type RelationCapabilities,
    type RelationProvider,
    type RelationWrite,
    RelationWriteError,
    TABLE_RELATION_CAPABILITIES,
} from "./relationProvider";
import type { RelationEvidence } from "./relationProvider";
import { addRecord, deleteRecord, setRecordValue, type TableHandles, type TableRecordValue } from "./tableDocs";
import type { TableSyncAdapter } from "./tableSyncAdapter";

interface TableMutationTracker {
    schema: number;
    rows: Map<string, number>;
    fields: Map<string, number>;
}

const mutationTrackers = new WeakMap<TableHandles["data"], TableMutationTracker>();

function mutationTracker(handles: TableHandles): TableMutationTracker {
    const existing = mutationTrackers.get(handles.data);
    if (existing) return existing;
    const tracker: TableMutationTracker = { schema: 0, rows: new Map(), fields: new Map() };
    handles.schemaText.observe(() => tracker.schema++);
    handles.data.observeDeep(events => {
        for (const event of events) {
            const rowId = event.path[0];
            if (typeof rowId === "string") {
                for (const column of event.changes.keys.keys()) {
                    tracker.fields.set(`${rowId}\0${column}`, (tracker.fields.get(`${rowId}\0${column}`) ?? 0) + 1);
                }
            } else {
                for (const changedRow of event.changes.keys.keys()) {
                    tracker.rows.set(changedRow, (tracker.rows.get(changedRow) ?? 0) + 1);
                }
            }
        }
    });
    mutationTrackers.set(handles.data, tracker);
    return tracker;
}

export class TableRelationProvider implements RelationProvider {
    readonly capabilities: RelationCapabilities = TABLE_RELATION_CAPABILITIES;

    private readonly handles: TableHandles;
    private readonly adapter: TableSyncAdapter;
    /** Resolves once the adapter finished its first schema application. */
    private readonly ready: Promise<unknown>;
    private readonly mutationTracker: TableMutationTracker;

    constructor(handles: TableHandles, adapter: TableSyncAdapter, ready: Promise<unknown>) {
        this.handles = handles;
        this.adapter = adapter;
        this.ready = ready;
        this.mutationTracker = mutationTracker(handles);
    }

    get schema() {
        return this.adapter.appliedSchema;
    }

    get sqlName(): string {
        return this.adapter.appliedSchema?.tableName ?? "";
    }

    get evidence(): RelationEvidence {
        return {
            kind: "table",
            id: this.handles.tableId,
            sqlName: this.sqlName,
            // Query provenance is captured before materialization can finish,
            // so it must remain stable across that first application. Pending
            // writes use existingRowWriteRevision below for the stronger,
            // monotonic effective-schema evidence.
            schemaRevision: this.handles.schemaText.toString(),
            columns: this.adapter.appliedSchema?.columns.map(column => column.name) ?? [],
        };
    }

    async materialize(): Promise<boolean> {
        await this.ready;
        return this.adapter.appliedSchema !== undefined;
    }

    subscribeInvalidation(listener: () => void): () => void {
        // TableSyncAdapter replays its current schema on subscribe. That is
        // establishment of the dependency, not a change after the query read
        // it, so only subsequent schema notifications invalidate evidence.
        let initialSchemaReplay = true;
        return this.adapter.subscribe({
            onSchemaChanged: () => {
                if (initialSchemaReplay) {
                    initialSchemaReplay = false;
                    return;
                }
                listener();
            },
            onDataChanged: listener,
            onDataApplied: listener,
        });
    }

    assertExistingRowWriteAllowed(write: Extract<RelationWrite, { op: "UPDATE" | "DELETE"; }>): void {
        assertWriteAllowed(this.capabilities, write, this.sqlName || "table");
        if (!this.handles.data.has(write.rowId)) {
            throw new RelationWriteError(`Record "${write.rowId}" does not exist in this table`);
        }
        if (
            write.op === "UPDATE" && !this.adapter.appliedSchema?.columns.some(column => column.name === write.column)
        ) {
            throw new RelationWriteError(`Column "${write.column}" is not writable in the current schema`);
        }
    }

    existingRowWriteRevision(rowId: string, column: string): string {
        const row = this.mutationTracker.rows.get(rowId) ?? 0;
        const field = this.mutationTracker.fields.get(`${rowId}\0${column}`) ?? 0;
        return `${this.mutationTracker.schema}:${this.adapter.effectiveFieldSchemaRevision(column)}:${row}:${field}`;
    }

    private applyWriteNow(write: RelationWrite): void {
        assertWriteAllowed(this.capabilities, write, this.sqlName || "table");
        switch (write.op) {
            case "UPDATE": {
                if (!this.handles.data.has(write.rowId)) {
                    throw new RelationWriteError(`Record "${write.rowId}" does not exist in this table`);
                }
                this.adapter.commitRecordValue(
                    write.rowId,
                    write.column,
                    write.value as TableRecordValue,
                    this.adapter.writeAuthorityToken,
                );
                return;
            }
            case "UPDATE_APPEND": {
                const record = this.handles.data.get(write.rowId);
                if (!record) {
                    throw new RelationWriteError(`Record "${write.rowId}" does not exist in this table`);
                }
                // A table field has no `Y.Array` backing of its own (unlike
                // the items relation's `tags`), so "append" here is a
                // read-modify-write of the JSON-array-encoded value — still
                // correct, just without the finer-grained merge a `Y.Array`
                // would give two concurrent appends.
                const raw = record.get(write.column);
                const current = parseJsonStringArray(raw);
                if (!current.includes(write.value)) current.push(write.value);
                setRecordValue(this.handles, write.rowId, write.column, JSON.stringify(current));
                return;
            }
            case "INSERT": {
                addRecord(this.handles, write.values as Record<string, TableRecordValue>);
                return;
            }
            case "DELETE": {
                deleteRecord(this.handles, write.rowId);
                return;
            }
        }
    }

    async applyWrite(write: RelationWrite): Promise<void> {
        let settle!: () => void;
        const applied = new Promise<void>(resolve => settle = resolve);
        const unsubscribe = this.adapter.subscribe({ onDataApplied: settle });
        try {
            this.applyWriteNow(write);
            await applied;
        } finally {
            unsubscribe();
        }
    }

    async applyWriteBatch(writes: readonly RelationWrite[]) {
        let applied = 0;
        let error: unknown;
        let settle!: () => void;
        const dataApplied = new Promise<void>(resolve => settle = resolve);
        const unsubscribe = this.adapter.subscribe({ onDataApplied: settle });
        try {
            this.handles.doc.transact(() => {
                for (const write of writes) {
                    try {
                        this.applyWriteNow(write);
                        applied++;
                    } catch (caught) {
                        error = caught;
                        break;
                    }
                }
            });
            if (applied > 0) await dataApplied;
        } finally {
            unsubscribe();
        }
        return error === undefined ? { applied } : { applied, error };
    }

    dispose(): void {
        this.adapter.dispose();
    }
}

/** Parse a JSON-array-of-strings column value; anything else is treated as an empty set. */
function parseJsonStringArray(value: unknown): string[] {
    if (typeof value !== "string" || value.trim() === "") return [];
    try {
        const parsed: unknown = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
    } catch {
        return [];
    }
}
