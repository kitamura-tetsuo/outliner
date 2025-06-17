import { Kysely } from "kysely";
import {
    createDialect,
    createInMemoryDatabase,
    type SqliteWasmDatabase,
} from "sqlite-wasm-kysely";

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

    async query(sql: string): Promise<{ rows: any[]; columnsMeta: ColumnMeta[]; }> {
        await this.init();
        const stmt = this.sqlite!.prepare(sql);
        const columnsMeta: ColumnMeta[] = [];
        const count = stmt.columnCount;

        // 簡略化されたカラムメタデータ取得
        for (let i = 0; i < count; i++) {
            const columnName = stmt.getColumnName(i);
            columnsMeta.push({
                table: "tbl", // 固定値として設定
                column: columnName,
                db: "main",
            });
        }

        const rows: any[] = [];
        while (stmt.step()) {
            rows.push(stmt.get({}));
        }
        stmt.finalize();
        return { rows, columnsMeta };
    }
}
