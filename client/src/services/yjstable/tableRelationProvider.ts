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
import { addRecord, deleteRecord, setRecordValue, type TableHandles, type TableRecordValue } from "./tableDocs";
import type { TableSyncAdapter } from "./tableSyncAdapter";

export class TableRelationProvider implements RelationProvider {
    readonly capabilities: RelationCapabilities = TABLE_RELATION_CAPABILITIES;

    private readonly handles: TableHandles;
    private readonly adapter: TableSyncAdapter;
    /** Resolves once the adapter finished its first schema application. */
    private readonly ready: Promise<unknown>;

    constructor(handles: TableHandles, adapter: TableSyncAdapter, ready: Promise<unknown>) {
        this.handles = handles;
        this.adapter = adapter;
        this.ready = ready;
    }

    get sqlName(): string {
        return this.adapter.appliedSchema?.tableName ?? "";
    }

    async materialize(): Promise<boolean> {
        await this.ready;
        return this.adapter.appliedSchema !== undefined;
    }

    async applyWrite(write: RelationWrite): Promise<void> {
        assertWriteAllowed(this.capabilities, write, this.sqlName || "table");
        switch (write.op) {
            case "UPDATE": {
                if (!this.handles.data.has(write.rowId)) {
                    throw new RelationWriteError(`Record "${write.rowId}" does not exist in this table`);
                }
                setRecordValue(this.handles, write.rowId, write.column, write.value as TableRecordValue);
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
