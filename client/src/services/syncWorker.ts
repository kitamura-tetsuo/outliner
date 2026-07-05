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
    exec: (sql: string) => void;
    // Add other methods as needed
}

interface SqlJsStatement {
    run: (params?: unknown[]) => SqlJsStatement;
    free: () => void;
    // Add other methods as needed
}

export class SyncWorker {
    private listeners: Map<string, EventListener[]> = new Map();
    private ydb: Y.Map<unknown> | null = null;
    private isConstructing = false;
    private observeHandler: ((events: Y.YEvent<any>[], tr: Y.Transaction) => void) | null = null;

    // 'sql.js' does not ship proper TypeScript types. We use an interface to provide type safety.
    constructor(private db: SqlJsDatabase) {}

    connect(ydb: Y.Map<unknown>) {
        if (this.ydb && this.observeHandler) {
            this.ydb.unobserveDeep(this.observeHandler);
        }

        this.ydb = ydb;
        this.constructDb();

        this.observeHandler = (events, tr) => {
            if (tr.origin === this) return;
            if (this.isConstructing) return;
            this.constructDb();
            this.emit("remote_change");
        };

        ydb.observeDeep(this.observeHandler);
    }

    constructDb() {
        if (!this.ydb) return;
        this.isConstructing = true;

        try {
            for (const tableName of this.ydb.keys()) {
                const tableMap = this.ydb.get(tableName);
                if (!tableMap || !(tableMap instanceof Y.Map)) continue;

                const columns = new Set<string>();
                columns.add("id"); // Primary key

                for (const rowKey of tableMap.keys()) {
                    const rowVal = tableMap.get(rowKey);
                    if (rowVal instanceof Y.Map) {
                        for (const col of rowVal.keys()) columns.add(col);
                    } else if (typeof rowVal === "object" && rowVal !== null) {
                        Object.keys(rowVal).forEach(col => columns.add(col));
                    }
                }

                const cols = Array.from(columns);
                const colDefs = cols.map(c => {
                    if (c === "id") return `"id" TEXT PRIMARY KEY`;
                    return `"${c}"`;
                }).join(", ");

                this.db.exec(`DROP TABLE IF EXISTS "${tableName}"`);
                this.db.exec(`CREATE TABLE "${tableName}" (${colDefs})`);

                for (const rowKey of tableMap.keys()) {
                    const rowVal = tableMap.get(rowKey);
                    let obj: Record<string, unknown> = {};
                    if (rowVal instanceof Y.Map) {
                        obj = rowVal.toJSON();
                    } else if (typeof rowVal === "object" && rowVal !== null) {
                        obj = rowVal as Record<string, unknown>;
                    }

                    obj.id = rowKey;

                    const fields = Object.keys(obj);
                    if (fields.length === 0) continue;

                    const placeholders = fields.map(() => "?").join(", ");
                    const stmt = this.db.prepare(
                        `INSERT INTO "${tableName}" (${fields.map(f => `"${f}"`).join(", ")}) VALUES (${placeholders})`,
                    );
                    stmt.run(fields.map(f => {
                        const val = obj[f];
                        if (val !== null && typeof val === "object") {
                            return JSON.stringify(val);
                        }
                        return val;
                    }));
                    stmt.free();
                }
            }
        } finally {
            this.isConstructing = false;
        }
    }

    applyOp(op: Op) {
        let val = op.value;
        if (val !== null && typeof val === "object") {
            val = JSON.stringify(val);
        }
        const stmt = this.db.prepare(`UPDATE "${op.table}" SET "${op.column}"=? WHERE "id"=?`);
        stmt.run([val, String(op.pk)]);
        stmt.free();

        if (this.ydb) {
            const tableMap = this.ydb.get(op.table);
            if (tableMap instanceof Y.Map) {
                const rowId = String(op.pk);
                const rowMap = tableMap.get(rowId);

                const doUpdate = () => {
                    if (rowMap instanceof Y.Map) {
                        rowMap.set(op.column, op.value);
                    } else if (typeof rowMap === "object" && rowMap !== null) {
                        tableMap.set(rowId, { ...rowMap, [op.column]: op.value });
                    }
                };

                if (this.ydb.doc) {
                    this.ydb.doc.transact(doUpdate, this);
                } else {
                    doUpdate();
                }
            }
        }

        this.emit("applied", op);
    }

    on(event: string, listener: EventListener) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(listener);
    }

    off(event: string) {
        this.listeners.delete(event);
    }

    emit(event: string, ...args: unknown[]) {
        const listeners = this.listeners.get(event);
        if (listeners) {
            listeners.forEach(listener => listener(...args));
        }
    }
}
