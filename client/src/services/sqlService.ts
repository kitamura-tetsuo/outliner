import { createDialect } from 'sqlite-wasm-kysely';
import { createInMemoryDatabase, SqliteWasmDatabase } from 'sqlite-wasm-kysely/dist/util';
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
        await this.db!.executeQuery(sql);
    }

    async query(sql: string): Promise<{ rows: any[]; columnsMeta: ColumnMeta[] }> {
        await this.init();
        const stmt = (this.sqlite as any).prepare(sql);
        const sqlite3 = this.sqlite!.sqlite3;
        const ptr = (stmt as any).pointer;
        const columnsMeta: ColumnMeta[] = [];
        const count = (stmt as any).columnCount();
        for (let i = 0; i < count; i++) {
            const table = sqlite3.capi.sqlite3_column_table_name(ptr, i) ?? null;
            const column = sqlite3.capi.sqlite3_column_origin_name(ptr, i) ?? null;
            const dbName = sqlite3.capi.sqlite3_column_database_name(ptr, i) ?? null;
            columnsMeta.push({ table, column, db: dbName });
        }
        const rows: any[] = [];
        while ((stmt as any).step()) {
            rows.push((stmt as any).get());
        }
        (stmt as any).free();
        return { rows, columnsMeta };
    }
}
