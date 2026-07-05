// sql.js lacks type definitions in this project context. Use proper generic types.
import * as Y from "yjs";

export interface Op {
    table: string;
    pk: string;
    column: string;
    value: unknown;
}

type EventListener = (...args: unknown[]) => void;

// Define a minimal interface for the sql.js database object to avoid 'any'
export interface SqlJsDatabase {
    prepare: (sql: string) => SqlJsStatement;
    exec?: (sql: string) => void;
    // Add other methods as needed
}

interface SqlJsStatement {
    run: (params?: unknown[]) => SqlJsStatement;
    free: () => void;
    // Add other methods as needed
}

export class SyncWorker {
    private listeners: Map<string, EventListener[]> = new Map();
    private yDatabase?: Y.Map<unknown>;
    private isRemoteUpdate = false;

    // 'sql.js' does not ship proper TypeScript types. We use an interface to provide type safety.
    constructor(private db: SqlJsDatabase) {}

    setYDatabase(yDatabase: Y.Map<unknown>) {
        this.yDatabase = yDatabase;
        this.syncFromYjs();
        this.yDatabase.observeDeep(() => {
            if (!this.isRemoteUpdate) {
                this.syncFromYjs();
            }
        });
    }

    private syncFromYjs() {
        if (!this.yDatabase || !this.db.exec) return;
        this.isRemoteUpdate = true;
        try {
            for (const [tableName, tableMap] of this.yDatabase.entries()) {
                if (tableMap instanceof Y.Map) {
                    const rowEntries = Array.from(tableMap.entries());
                    if (rowEntries.length > 0) {
                        const firstRow = rowEntries[0][1];
                        if (firstRow instanceof Y.Map) {
                            const cols = Array.from(firstRow.keys());
                            const defs = cols.map(c => c === "id" ? "id TEXT PRIMARY KEY" : `${c}`).join(", ");
                            try {
                                this.db.exec(`CREATE TABLE IF NOT EXISTS ${tableName} (${defs})`);
                            } catch (e) {
                                // Table might already exist
                            }
                        }
                    }

                    try {
                        this.db.exec(`DELETE FROM ${tableName}`);
                    } catch (e) {
                        // Table might not exist
                    }

                    for (const [rowId, rowMap] of rowEntries) {
                        if (rowMap instanceof Y.Map) {
                            const entries = Array.from(rowMap.entries());
                            const cols = entries.map(e => e[0]).join(", ");
                            const placeholders = entries.map(() => "?").join(", ");
                            const vals = entries.map(e => e[1]);
                            try {
                                const stmt = this.db.prepare(
                                    `INSERT INTO ${tableName} (${cols}) VALUES (${placeholders})`,
                                );
                                stmt.run(vals);
                                stmt.free();
                            } catch (e) {
                                console.error(e);
                            }
                        }
                    }
                }
            }
        } finally {
            this.isRemoteUpdate = false;
        }
    }

    applyOp(op: Op) {
        try {
            const stmt = this.db.prepare(`UPDATE ${op.table} SET ${op.column}=? WHERE id=?`);
            stmt.run([op.value, op.pk]);
            stmt.free();
        } catch (e) {
            console.error(e);
        }
        this.emit("applied", op);

        if (this.yDatabase) {
            this.isRemoteUpdate = true;
            try {
                let tableMap = this.yDatabase.get(op.table) as Y.Map<unknown> | undefined;
                if (!tableMap) {
                    tableMap = new Y.Map();
                    this.yDatabase.set(op.table, tableMap);
                }
                let rowMap = tableMap.get(op.pk) as Y.Map<unknown> | undefined;
                if (!rowMap) {
                    rowMap = new Y.Map();
                    rowMap.set("id", op.pk);
                    tableMap.set(op.pk, rowMap);
                }
                rowMap.set(op.column, op.value);
            } finally {
                this.isRemoteUpdate = false;
            }
        }
    }

    on(event: string, listener: EventListener) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(listener);
    }

    emit(event: string, ...args: unknown[]) {
        const listeners = this.listeners.get(event);
        if (listeners) {
            listeners.forEach(listener => listener(...args));
        }
    }
}
