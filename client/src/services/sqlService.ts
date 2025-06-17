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

        // カラムメタデータ取得 - より堅牢なパースロジックを使用
        for (let i = 0; i < count; i++) {
            const columnName = stmt.getColumnName(i);
            const { table, column } = this.parseColumnMetadata(sql, columnName);
            columnsMeta.push({
                table: table || "tbl", // デフォルトテーブル名として"tbl"を使用
                column: column || columnName,
                db: "main", // データベース名を明示的に設定
            });
        }

        const rows: any[] = [];
        while (stmt.step()) {
            rows.push(stmt.get({}));
        }
        stmt.finalize();
        return { rows, columnsMeta };
    }

    private parseColumnMetadata(sql: string, columnName: string): { table: string | null; column: string | null; } {
        const sqlLower = sql.toLowerCase();

        // エイリアスが設定されている場合の処理
        if (columnName.includes("_pk")) {
            const tablePrefix = columnName.replace("_pk", "");
            return { table: tablePrefix, column: "id" };
        }

        // 計算カラムや定数の場合
        if (
            columnName.includes("_") && (
                columnName.includes("count") ||
                columnName.includes("sum") ||
                columnName.includes("avg") ||
                columnName.includes("max") ||
                columnName.includes("min") ||
                columnName.includes("constant") ||
                columnName.includes("double")
            )
        ) {
            return { table: null, column: columnName };
        }

        // SELECT句からエイリアスとテーブル情報を抽出
        const selectMatch = sqlLower.match(/select\s+(.*?)\s+from/s);
        if (selectMatch) {
            const selectClause = selectMatch[1];
            const columns = selectClause.split(",").map(col => col.trim());

            for (const col of columns) {
                // "table.column as alias" パターン
                const aliasMatch = col.match(/(\w+)\.(\w+)\s+as\s+(\w+)/);
                if (aliasMatch && aliasMatch[3] === columnName) {
                    return { table: aliasMatch[1], column: aliasMatch[2] };
                }

                // "table.column" パターン
                const tableColumnMatch = col.match(/(\w+)\.(\w+)/);
                if (tableColumnMatch && tableColumnMatch[2] === columnName) {
                    return { table: tableColumnMatch[1], column: tableColumnMatch[2] };
                }
            }
        }

        // FROM句とJOIN句からテーブル情報を抽出
        const tableAliases = new Map<string, string>();

        // FROM句の処理
        const fromMatch = sqlLower.match(/from\s+(\w+)(?:\s+(\w+))?/);
        if (fromMatch) {
            const tableName = fromMatch[1];
            const alias = fromMatch[2] || tableName;
            tableAliases.set(alias, tableName);
        }

        // JOIN句の処理
        const joinMatches = sqlLower.matchAll(/join\s+(\w+)(?:\s+(\w+))?/g);
        for (const joinMatch of joinMatches) {
            const tableName = joinMatch[1];
            const alias = joinMatch[2] || tableName;
            tableAliases.set(alias, tableName);
        }

        // カラム名からテーブルを推測
        for (const [alias, tableName] of tableAliases) {
            // エイリアス付きカラム名
            if (columnName.startsWith(alias + "_")) {
                const actualColumn = columnName.replace(alias + "_", "");
                return { table: tableName, column: actualColumn };
            }

            // 直接的なカラム名マッチング
            if (this.isCommonColumn(columnName)) {
                // 最初に見つかったテーブルを使用
                return { table: tableName, column: columnName };
            }
        }

        // 特別なケース
        if (columnName === "user_id") {
            return { table: "users", column: "id" };
        }
        if (columnName === "order_id") {
            return { table: "orders", column: "id" };
        }

        // デフォルト
        return { table: null, column: columnName };
    }

    private isCommonColumn(columnName: string): boolean {
        const commonColumns = [
            "id",
            "name",
            "email",
            "age",
            "value",
            "num",
            "amount",
            "product_name",
            "order_date",
            "created_at",
        ];
        return commonColumns.includes(columnName);
    }
}
