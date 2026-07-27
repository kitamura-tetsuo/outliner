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
