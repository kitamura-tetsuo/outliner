// sql.js lacks type definitions in this project context. Use proper generic types.

export interface Op {
    table: string;
    pk: string;
    column: string;
    value: unknown;
}

type EventListener = (...args: unknown[]) => void;

// Define a minimal interface for the sql.js database object to avoid 'unknown'
interface SqlJsDatabase {
    prepare: (sql: string) => SqlJsStatement;
    // Add other methods as needed
}

interface SqlJsStatement {
    run: (params?: unknown[]) => SqlJsStatement;
    free: () => void;
    // Add other methods as needed
}

export class SyncWorker {
    private listeners: Map<string, EventListener[]> = new Map();

    // 'sql.js' does not ship proper TypeScript types. We use an interface to provide type safety.
    constructor(private db: SqlJsDatabase) {}

    applyOp(op: Op) {
        const stmt = this.db.prepare(`UPDATE ${op.table} SET ${op.column}=? WHERE id=?`);
        stmt.run([op.value, op.pk]);
        stmt.free();
        this.emit("applied", op);
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
