import type { Database } from 'sql.js';
import { EventEmitter } from 'events';

export interface Op {
    table: string;
    pk: string;
    column: string;
    value: any;
}

export class SyncWorker extends EventEmitter {
    constructor(private db: Database) {
        super();
    }

    applyOp(op: Op) {
        const stmt = this.db.prepare(`UPDATE ${op.table} SET ${op.column}=? WHERE id=?`);
        stmt.run([op.value, op.pk]);
        stmt.free();
        this.emit('applied', op);
    }
}
