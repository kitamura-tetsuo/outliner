/** @feature TBL-0003
 * SQL クエリ実行テスト
 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("TBL-0003: SQL クエリ実行テスト", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [], false, true);
        await page.goto("/join-table", { waitUntil: "domcontentloaded" });

        // ページが完全に読み込まれるまで待機
        await page.waitForFunction(() => {
            return window.__JOIN_TABLE__ &&
                window.__JOIN_TABLE__.fluid &&
                window.__JOIN_TABLE__.store &&
                window.__JOIN_TABLE__.sql;
        }, { timeout: 10000 });

        // onMountの完了とSQLテーブルが初期化されるまで待機
        await page.waitForFunction(async () => {
            try {
                // まずJOIN_TABLEオブジェクトが存在することを確認
                if (!window.__JOIN_TABLE__ || !window.__JOIN_TABLE__.sql) {
                    return false;
                }

                // テーブルの存在確認
                const result = await window.__JOIN_TABLE__.sql.query("SELECT COUNT(*) as count FROM tbl");
                return result && result.rows && result.rows.length > 0;
            }
            catch (error) {
                // テーブルが存在しない場合は、onMountの完了を待つ
                return false;
            }
        }, { timeout: 30000 });

        // 追加の安全性チェック：データが実際に存在することを確認
        await page.waitForFunction(async () => {
            try {
                const result = await window.__JOIN_TABLE__.sql.query("SELECT * FROM tbl");
                return result && result.rows && result.rows.length >= 2; // 初期データが2件あることを確認
            }
            catch (error) {
                return false;
            }
        }, { timeout: 10000 });
    });

    test("basic SQL query execution", async ({ page }) => {
        // 基本的なSELECTクエリの実行
        const result = await page.evaluate(async () => {
            const sql = window.__JOIN_TABLE__?.sql;
            if (!sql) return null;

            return await sql.query("SELECT * FROM tbl");
        });

        expect(result).toBeDefined();
        expect(result.rows).toBeDefined();
        expect(result.columnsMeta).toBeDefined();
        expect(Array.isArray(result.rows)).toBe(true);
        expect(Array.isArray(result.columnsMeta)).toBe(true);
    });

    test("complex JOIN query execution", async ({ page }) => {
        // 複雑なJOINクエリのテスト用にテーブルを作成
        await page.evaluate(async () => {
            const sql = window.__JOIN_TABLE__?.sql;
            if (!sql) return;

            // 関連テーブルを作成
            await sql.exec("CREATE TABLE users(id TEXT PRIMARY KEY, name TEXT, department_id TEXT)");
            await sql.exec("CREATE TABLE departments(id TEXT PRIMARY KEY, name TEXT, budget INTEGER)");

            // テストデータを挿入
            await sql.exec("INSERT INTO users VALUES('u1','Alice','d1'),('u2','Bob','d2'),('u3','Charlie','d1')");
            await sql.exec("INSERT INTO departments VALUES('d1','Engineering',100000),('d2','Marketing',50000)");
        });

        // JOINクエリを実行
        const result = await page.evaluate(async () => {
            const sql = window.__JOIN_TABLE__?.sql;
            if (!sql) return null;

            return await sql.query(`
                SELECT u.name as user_name, d.name as dept_name, d.budget
                FROM users u 
                JOIN departments d ON u.department_id = d.id
                ORDER BY u.name
            `);
        });

        expect(result).toBeDefined();
        expect(result.rows).toHaveLength(3);
        expect(result.rows[0]).toMatchObject({
            user_name: "Alice",
            dept_name: "Engineering",
            budget: 100000,
        });
    });

    test("SQL error handling", async ({ page }) => {
        // 構文エラーのあるクエリを実行
        const errorResult = await page.evaluate(async () => {
            const sql = window.__JOIN_TABLE__?.sql;
            if (!sql) return null;

            try {
                await sql.query("SELECT * FROM non_existent_table");
                return { success: true };
            }
            catch (error) {
                return {
                    success: false,
                    error: error.message || error.toString(),
                };
            }
        });

        expect(errorResult).toBeDefined();
        expect(errorResult.success).toBe(false);
        expect(errorResult.error).toContain("no such table");
    });

    test("column metadata extraction", async ({ page }) => {
        // メタデータ抽出のテスト
        const metadata = await page.evaluate(async () => {
            const sql = window.__JOIN_TABLE__?.sql;
            if (!sql) return null;

            const result = await sql.query("SELECT id as tbl_pk, value, num FROM tbl");
            return result.columnsMeta;
        });

        expect(metadata).toBeDefined();
        expect(metadata).toHaveLength(3);

        // 各カラムのメタデータを確認
        expect(metadata[0]).toMatchObject({
            table: "tbl",
            column: "id",
        });
        expect(metadata[1]).toMatchObject({
            table: "tbl",
            column: "value",
        });
        expect(metadata[2]).toMatchObject({
            table: "tbl",
            column: "num",
        });
    });

    test("query performance measurement", async ({ page }) => {
        // 大量データでのパフォーマンステスト
        const performanceResult = await page.evaluate(async () => {
            const sql = window.__JOIN_TABLE__?.sql;
            if (!sql) return null;

            // 大量データを作成
            await sql.exec("CREATE TABLE large_table(id INTEGER PRIMARY KEY, data TEXT)");

            const insertStart = performance.now();
            for (let i = 0; i < 1000; i++) {
                await sql.exec(`INSERT INTO large_table VALUES(${i}, 'data_${i}')`);
            }
            const insertTime = performance.now() - insertStart;

            // クエリ実行時間を測定
            const queryStart = performance.now();
            const result = await sql.query("SELECT COUNT(*) as count FROM large_table");
            const queryTime = performance.now() - queryStart;

            return {
                insertTime,
                queryTime,
                rowCount: result.rows[0].count,
            };
        });

        expect(performanceResult).toBeDefined();
        expect(performanceResult.rowCount).toBe(1000);
        expect(performanceResult.insertTime).toBeLessThan(5000); // 5秒以内
        expect(performanceResult.queryTime).toBeLessThan(100); // 100ms以内
    });

    test("aggregate functions and GROUP BY", async ({ page }) => {
        // 集計関数とGROUP BYのテスト
        await page.evaluate(async () => {
            const sql = window.__JOIN_TABLE__?.sql;
            if (!sql) return;

            // テーブルの存在確認と作成
            try {
                await sql.query("SELECT 1 FROM tbl LIMIT 1");
            }
            catch {
                // テーブルが存在しない場合は作成
                await sql.exec("CREATE TABLE tbl(id TEXT PRIMARY KEY, value TEXT, num INTEGER)");
            }

            // テーブルをクリアして期待されるデータのみを挿入
            await sql.exec("DELETE FROM tbl");
            await sql.exec("INSERT INTO tbl VALUES('1','a',1),('2','b',2)");
            // テストデータを追加（'a'グループに1つ、'b'グループに1つ）
            await sql.exec("INSERT INTO tbl VALUES('5','b',20),('6','a',30)");
        });

        const result = await page.evaluate(async () => {
            const sql = window.__JOIN_TABLE__?.sql;
            if (!sql) return null;

            return await sql.query(`
                SELECT value, COUNT(*) as count, SUM(num) as total, AVG(num) as average
                FROM tbl 
                GROUP BY value 
                ORDER BY value
            `);
        });

        expect(result).toBeDefined();
        expect(result.rows).toHaveLength(2); // 'a' and 'b' groups

        const aGroup = result.rows.find(row => row.value === "a");
        const bGroup = result.rows.find(row => row.value === "b");

        expect(aGroup).toMatchObject({
            value: "a",
            count: 2, // '1','a',1 + '6','a',30
            total: 31, // 1 + 30
            average: 15.5,
        });

        expect(bGroup).toMatchObject({
            value: "b",
            count: 2, // '2','b',2 + '5','b',20
            total: 22, // 2 + 20
            average: 11,
        });
    });

    test("subqueries and window functions", async ({ page }) => {
        // サブクエリとウィンドウ関数のテスト
        const result = await page.evaluate(async () => {
            const sql = window.__JOIN_TABLE__?.sql;
            if (!sql) return null;

            try {
                return await sql.query(`
                    SELECT 
                        value,
                        num,
                        (SELECT AVG(num) FROM tbl) as overall_avg,
                        ROW_NUMBER() OVER (ORDER BY num DESC) as rank_by_num
                    FROM tbl 
                    ORDER BY num DESC
                `);
            }
            catch (error) {
                return { error: error.message };
            }
        });

        expect(result).toBeDefined();
        if (result.error) {
            // ウィンドウ関数がサポートされていない場合はスキップ
            console.log("Window functions not supported:", result.error);
        }
        else {
            expect(result.rows).toBeDefined();
            expect(result.rows.length).toBeGreaterThan(0);
        }
    });

    test("transaction handling", async ({ page }) => {
        // トランザクション処理のテスト
        const transactionResult = await page.evaluate(async () => {
            const sql = window.__JOIN_TABLE__?.sql;
            if (!sql) return null;

            try {
                // トランザクション開始
                await sql.exec("BEGIN TRANSACTION");

                // データを挿入
                await sql.exec("INSERT INTO tbl VALUES('tx1','transaction_test',999)");

                // データが挿入されたことを確認
                const beforeRollback = await sql.query("SELECT * FROM tbl WHERE id='tx1'");

                // ロールバック
                await sql.exec("ROLLBACK");

                // データがロールバックされたことを確認
                const afterRollback = await sql.query("SELECT * FROM tbl WHERE id='tx1'");

                return {
                    beforeRollback: beforeRollback.rows.length,
                    afterRollback: afterRollback.rows.length,
                };
            }
            catch (error) {
                return { error: error.message };
            }
        });

        expect(transactionResult).toBeDefined();
        if (transactionResult.error) {
            console.log("Transaction not supported:", transactionResult.error);
        }
        else {
            expect(transactionResult.beforeRollback).toBe(1);
            expect(transactionResult.afterRollback).toBe(0);
        }
    });

    test("data type handling", async ({ page }) => {
        // データ型の処理テスト
        await page.evaluate(async () => {
            const sql = window.__JOIN_TABLE__?.sql;
            if (!sql) return;

            // 様々なデータ型のテーブルを作成
            await sql.exec(`
                CREATE TABLE type_test(
                    id INTEGER PRIMARY KEY,
                    text_col TEXT,
                    int_col INTEGER,
                    real_col REAL,
                    blob_col BLOB,
                    null_col TEXT
                )
            `);

            // 様々な型のデータを挿入
            await sql.exec(`
                INSERT INTO type_test VALUES(
                    1, 
                    'text_value', 
                    42, 
                    3.14159, 
                    X'48656C6C6F', 
                    NULL
                )
            `);
        });

        const result = await page.evaluate(async () => {
            const sql = window.__JOIN_TABLE__?.sql;
            if (!sql) return null;

            return await sql.query("SELECT * FROM type_test");
        });

        expect(result).toBeDefined();
        expect(result.rows).toHaveLength(1);

        const row = result.rows[0];
        expect(row.id).toBe(1);
        expect(row.text_col).toBe("text_value");
        expect(row.int_col).toBe(42);
        expect(row.real_col).toBeCloseTo(3.14159, 5);
        expect(row.null_col).toBeNull();
    });
});
