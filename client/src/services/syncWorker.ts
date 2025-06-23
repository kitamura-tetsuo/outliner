import type { Database } from "sql.js";

export interface Op {
    table: string;
    pk: string;
    column: string;
    value: any;
}

export class SyncWorker {
    private listeners: Map<string, Function[]> = new Map();

    constructor(private db: Database) {}

    applyOp(op: Op) {
        const stmt = this.db.prepare(`UPDATE ${op.table} SET ${op.column}=? WHERE id=?`);
        stmt.run([op.value, op.pk]);
        stmt.free();
        this.emit("applied", op);
    }

    on(event: string, listener: Function) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(listener);
    }

    emit(event: string, ...args: any[]) {
        const listeners = this.listeners.get(event);
        if (listeners) {
            listeners.forEach(listener => listener(...args));
        }
    }
}
