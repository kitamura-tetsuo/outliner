import { createDialect, createInMemoryDatabase, type SqliteWasmDatabase } from 'sqlite-wasm-kysely';
import { Kysely } from 'kysely';

export interface ColumnMeta {
    table: string | null;
    column: string | null;
    db: string | null;
}

export class SqlService {
    private db?: Kysely<any>;
    private sqlite?: SqliteWasmDatabase;

    async init() {
        if (!this.db) {
            this.sqlite = await createInMemoryDatabase({ readOnly: false });
            this.db = new Kysely<any>({ dialect: createDialect({ database: this.sqlite }) });
        }
    }

    async exec(sql: string) {
        await this.init();
        this.sqlite!.exec(sql);
    }

    async query(sql: string): Promise<{ rows: any[]; columnsMeta: ColumnMeta[] }> {
        await this.init();
        const stmt = this.sqlite!.prepare(sql);
        const sqlite3 = this.sqlite!.sqlite3;
        const ptr = stmt.pointer;
        const columnsMeta: ColumnMeta[] = [];
        const count = stmt.columnCount;
        for (let i = 0; i < count; i++) {
            const tableFn = sqlite3.capi.sqlite3_column_table_name as any;
            const columnFn = sqlite3.capi.sqlite3_column_origin_name as any;
            const dbFn = sqlite3.capi.sqlite3_column_database_name as any;
            const table = typeof tableFn === 'function' ? tableFn(ptr, i) : null;
            const column = typeof columnFn === 'function' ? columnFn(ptr, i) : null;
            const dbName = typeof dbFn === 'function' ? dbFn(ptr, i) : null;
            columnsMeta.push({ table, column, db: dbName });
        }
        const rows: any[] = [];
        while (stmt.step()) {
            rows.push(stmt.get({}));
        }
        stmt.finalize();
        return { rows, columnsMeta };
    }
}
