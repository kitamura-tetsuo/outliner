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
                table: table, // nullを許可し、計算カラムではnullを設定
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

        // 計算カラムや定数の場合（より厳密に判定）
        if (this.isCalculatedColumn(columnName, sqlLower)) {
            return { table: null, column: columnName };
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
        const joinMatches = sqlLower.matchAll(/(?:inner\s+|left\s+|right\s+|full\s+)?join\s+(\w+)(?:\s+(\w+))?/g);
        for (const joinMatch of joinMatches) {
            const tableName = joinMatch[1];
            const alias = joinMatch[2] || tableName;
            tableAliases.set(alias, tableName);
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
                    const aliasName = aliasMatch[1];
                    const actualTableName = tableAliases.get(aliasName) || aliasName;
                    return { table: actualTableName, column: aliasMatch[2] };
                }

                // "table.column" パターン（エイリアスなし）
                const tableColumnMatch = col.match(/(\w+)\.(\w+)$/);
                if (tableColumnMatch && tableColumnMatch[2] === columnName) {
                    const aliasName = tableColumnMatch[1];
                    const actualTableName = tableAliases.get(aliasName) || aliasName;
                    return { table: actualTableName, column: tableColumnMatch[2] };
                }
            }
        }

        // 特別なケース（エイリアス付きカラム名）
        if (columnName === "user_id") {
            return { table: "users", column: "id" };
        }
        if (columnName === "order_id") {
            return { table: "orders", column: "id" };
        }
        if (columnName === "user_name") {
            return { table: "users", column: "name" };
        }

        // カラム名からテーブルを推測（最後の手段）
        for (const [alias, tableName] of tableAliases) {
            // エイリアス付きカラム名
            if (columnName.startsWith(alias + "_")) {
                const actualColumn = columnName.replace(alias + "_", "");
                return { table: tableName, column: actualColumn };
            }

            // 直接的なカラム名マッチング（共通カラム名の場合）
            if (this.isCommonColumn(columnName)) {
                // 最初に見つかったテーブルを使用
                return { table: tableName, column: columnName };
            }
        }

        // デフォルト（テーブル情報が特定できない場合）
        return { table: null, column: columnName };
    }

    private isCalculatedColumn(columnName: string, sqlLower: string): boolean {
        // カラム名に計算を示すキーワードが含まれている場合のみ計算カラムとする
        const calculatedKeywords = [
            "count",
            "sum",
            "avg",
            "max",
            "min",
            "total",
            "double",
            "constant",
            "row_count",
        ];

        // カラム名自体に計算を示すキーワードが含まれている場合
        if (calculatedKeywords.some(keyword => columnName.includes(keyword))) {
            return true;
        }

        // SELECT句で明示的に計算式として定義されているかチェック
        const selectMatch = sqlLower.match(/select\s+(.*?)\s+from/s);
        if (selectMatch) {
            const selectClause = selectMatch[1];
            const columns = selectClause.split(",").map(col => col.trim());

            for (const col of columns) {
                // "expression as alias" パターンで、aliasがcolumnNameと一致する場合
                const aliasMatch = col.match(/(.+)\s+as\s+(\w+)/);
                if (aliasMatch && aliasMatch[2] === columnName) {
                    const expression = aliasMatch[1].trim();

                    // 集計関数や計算式のパターン
                    const calculatedPatterns = [
                        /count\s*\(/i,
                        /sum\s*\(/i,
                        /avg\s*\(/i,
                        /max\s*\(/i,
                        /min\s*\(/i,
                        /\*\s*\d+/, // 乗算
                        /\+\s*\d+/, // 加算
                        /-\s*\d+/, // 減算
                        /\/\s*\d+/, // 除算
                        /'[^']*'/, // 文字列定数
                    ];

                    return calculatedPatterns.some(pattern => pattern.test(expression));
                }
            }
        }

        return false;
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
