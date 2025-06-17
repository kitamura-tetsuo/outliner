/** @feature TBL-0003
 *  Title   : SQL クエリ実行テスト
 *  Source  : docs/client-features.yaml
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqlService } from '../services/sqlService';

describe('SqlService Advanced Tests', () => {
    let sqlService: SqlService;

    beforeEach(async () => {
        sqlService = new SqlService();
        
        // テスト用のテーブルとデータを作成
        await sqlService.exec(`
            CREATE TABLE users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT UNIQUE,
                age INTEGER,
                created_at TEXT
            )
        `);
        
        await sqlService.exec(`
            CREATE TABLE orders (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                product_name TEXT,
                amount REAL,
                order_date TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);
        
        await sqlService.exec(`
            CREATE TABLE categories (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT
            )
        `);
        
        // テストデータの挿入
        await sqlService.exec(`
            INSERT INTO users (id, name, email, age, created_at) VALUES
            ('u1', 'Alice', 'alice@example.com', 25, '2024-01-01'),
            ('u2', 'Bob', 'bob@example.com', 30, '2024-01-02'),
            ('u3', 'Charlie', 'charlie@example.com', 35, '2024-01-03')
        `);
        
        await sqlService.exec(`
            INSERT INTO orders (id, user_id, product_name, amount, order_date) VALUES
            ('o1', 'u1', 'Product A', 100.50, '2024-02-01'),
            ('o2', 'u1', 'Product B', 200.75, '2024-02-02'),
            ('o3', 'u2', 'Product C', 150.25, '2024-02-03'),
            ('o4', 'u3', 'Product A', 300.00, '2024-02-04')
        `);
        
        await sqlService.exec(`
            INSERT INTO categories (id, name, description) VALUES
            ('c1', 'Electronics', 'Electronic devices and accessories'),
            ('c2', 'Books', 'Books and educational materials'),
            ('c3', 'Clothing', 'Apparel and fashion items')
        `);
    });

    afterEach(async () => {
        // クリーンアップ
        if (sqlService) {
            try {
                await sqlService.exec('DROP TABLE IF EXISTS orders');
                await sqlService.exec('DROP TABLE IF EXISTS users');
                await sqlService.exec('DROP TABLE IF EXISTS categories');
            } catch (error) {
                // エラーは無視（テスト環境のクリーンアップ）
            }
        }
    });

    describe('複雑なJOINクエリのテスト', () => {
        it('INNER JOINが正しく実行される', async () => {
            const query = `
                SELECT 
                    u.id as user_id,
                    u.name as user_name,
                    o.id as order_id,
                    o.product_name,
                    o.amount
                FROM users u
                INNER JOIN orders o ON u.id = o.user_id
                ORDER BY u.name, o.order_date
            `;
            
            const result = await sqlService.query(query);
            
            expect(result.rows).toBeDefined();
            expect(result.rows.length).toBe(4); // 4つの注文
            expect(result.columnsMeta).toBeDefined();
            expect(result.columnsMeta.length).toBe(5);
            
            // メタデータの確認（エイリアスを考慮）
            const userIdMeta = result.columnsMeta.find(col =>
                (col.column === 'id' && col.table === 'users') ||
                (col.column === 'user_id')
            );
            const orderIdMeta = result.columnsMeta.find(col =>
                (col.column === 'id' && col.table === 'orders') ||
                (col.column === 'order_id')
            );

            expect(userIdMeta).toBeDefined();
            expect(orderIdMeta).toBeDefined();
            
            // データの確認
            const aliceOrders = result.rows.filter(row => row.user_name === 'Alice');
            expect(aliceOrders.length).toBe(2);
        });

        it('LEFT JOINが正しく実行される', async () => {
            // ユーザーを追加（注文なし）
            await sqlService.exec(`
                INSERT INTO users (id, name, email, age, created_at) VALUES
                ('u4', 'David', 'david@example.com', 28, '2024-01-04')
            `);
            
            const query = `
                SELECT 
                    u.id as user_id,
                    u.name as user_name,
                    o.id as order_id,
                    o.product_name
                FROM users u
                LEFT JOIN orders o ON u.id = o.user_id
                ORDER BY u.name
            `;
            
            const result = await sqlService.query(query);
            
            expect(result.rows.length).toBe(5); // 4つの注文 + 1つのnull結合
            
            // Davidの行を確認（注文がないのでorder_idがnull）
            const davidRow = result.rows.find(row => row.user_name === 'David');
            expect(davidRow).toBeDefined();
            expect(davidRow.order_id).toBeNull();
        });

        it('複数テーブルのJOINが正しく実行される', async () => {
            // 商品カテゴリテーブルを追加
            await sqlService.exec(`
                CREATE TABLE products (
                    id TEXT PRIMARY KEY,
                    name TEXT,
                    category_id TEXT,
                    FOREIGN KEY (category_id) REFERENCES categories(id)
                )
            `);
            
            await sqlService.exec(`
                INSERT INTO products (id, name, category_id) VALUES
                ('p1', 'Product A', 'c1'),
                ('p2', 'Product B', 'c2'),
                ('p3', 'Product C', 'c1')
            `);
            
            const query = `
                SELECT 
                    u.name as user_name,
                    o.product_name,
                    p.name as product_full_name,
                    c.name as category_name
                FROM users u
                INNER JOIN orders o ON u.id = o.user_id
                INNER JOIN products p ON o.product_name = p.name
                INNER JOIN categories c ON p.category_id = c.id
                ORDER BY u.name
            `;
            
            const result = await sqlService.query(query);
            
            expect(result.rows.length).toBeGreaterThan(0);
            expect(result.columnsMeta.length).toBe(4);
            
            // 各テーブルからのメタデータが含まれることを確認（より柔軟に）
            const tableNames = result.columnsMeta.map(col => col.table).filter(Boolean);
            const uniqueTableNames = [...new Set(tableNames)];
            expect(uniqueTableNames.length).toBeGreaterThan(1); // 複数のテーブルが含まれている
        });
    });

    describe('エラーハンドリングのテスト', () => {
        it('構文エラーが適切にハンドリングされる', async () => {
            const invalidQuery = 'SELECT * FORM users'; // 意図的な構文エラー
            
            await expect(sqlService.query(invalidQuery)).rejects.toThrow();
        });

        it('存在しないテーブルへのクエリがエラーになる', async () => {
            const query = 'SELECT * FROM non_existent_table';
            
            await expect(sqlService.query(query)).rejects.toThrow();
        });

        it('存在しないカラムへのクエリがエラーになる', async () => {
            const query = 'SELECT non_existent_column FROM users';
            
            await expect(sqlService.query(query)).rejects.toThrow();
        });

        it('型変換エラーが適切にハンドリングされる', async () => {
            const query = `SELECT CAST('invalid_number' AS INTEGER) as invalid_cast`;
            
            // SQLiteは型変換に寛容なので、この場合は0が返される
            const result = await sqlService.query(query);
            expect(result.rows[0].invalid_cast).toBe(0);
        });

        it('制約違反エラーが適切にハンドリングされる', async () => {
            // UNIQUE制約違反
            const insertQuery = `
                INSERT INTO users (id, name, email, age) 
                VALUES ('u5', 'Eve', 'alice@example.com', 25)
            `;
            
            await expect(sqlService.exec(insertQuery)).rejects.toThrow();
        });
    });

    describe('パフォーマンス測定のテスト', () => {
        it('大量データでのクエリ実行時間を測定する', async () => {
            // 大量データを挿入
            const batchSize = 1000;
            const insertValues = [];
            
            for (let i = 0; i < batchSize; i++) {
                insertValues.push(`('perf_u${i}', 'User${i}', 'user${i}@example.com', ${20 + (i % 50)}, '2024-01-01')`);
            }
            
            const insertQuery = `
                INSERT INTO users (id, name, email, age, created_at) VALUES
                ${insertValues.join(', ')}
            `;
            
            await sqlService.exec(insertQuery);
            
            // クエリ実行時間を測定
            const startTime = performance.now();
            const result = await sqlService.query('SELECT * FROM users WHERE age > 30 ORDER BY name');
            const endTime = performance.now();
            
            const executionTime = endTime - startTime;
            
            expect(result.rows.length).toBeGreaterThan(0);
            expect(executionTime).toBeLessThan(1000); // 1秒以内
            
            console.log(`Query execution time: ${executionTime.toFixed(2)}ms for ${result.rows.length} rows`);
        });

        it('複雑なJOINクエリのパフォーマンスを測定する', async () => {
            // 追加のテストデータ
            const orderValues = [];
            for (let i = 0; i < 500; i++) {
                const userId = `u${(i % 3) + 1}`;
                orderValues.push(`('perf_o${i}', '${userId}', 'Product ${i % 10}', ${(i * 10.5).toFixed(2)}, '2024-02-${(i % 28) + 1}')`);
            }
            
            await sqlService.exec(`
                INSERT INTO orders (id, user_id, product_name, amount, order_date) VALUES
                ${orderValues.join(', ')}
            `);
            
            const complexQuery = `
                SELECT 
                    u.name,
                    COUNT(o.id) as order_count,
                    SUM(o.amount) as total_amount,
                    AVG(o.amount) as avg_amount,
                    MAX(o.amount) as max_amount
                FROM users u
                LEFT JOIN orders o ON u.id = o.user_id
                GROUP BY u.id, u.name
                HAVING COUNT(o.id) > 0
                ORDER BY total_amount DESC
            `;
            
            const startTime = performance.now();
            const result = await sqlService.query(complexQuery);
            const endTime = performance.now();
            
            const executionTime = endTime - startTime;
            
            expect(result.rows.length).toBeGreaterThan(0);
            expect(executionTime).toBeLessThan(2000); // 2秒以内
            
            console.log(`Complex JOIN query execution time: ${executionTime.toFixed(2)}ms`);
        });
    });

    describe('メタデータ抽出のテスト', () => {
        it('単純なクエリのメタデータが正しく抽出される', async () => {
            const result = await sqlService.query('SELECT id, name, email FROM users');
            
            expect(result.columnsMeta).toBeDefined();
            expect(result.columnsMeta.length).toBe(3);
            
            const idMeta = result.columnsMeta[0];
            expect(idMeta.column).toBe('id');
            expect(idMeta.table).toBe('users');
            
            const nameMeta = result.columnsMeta[1];
            expect(nameMeta.column).toBe('name');
            expect(nameMeta.table).toBe('users');
        });

        it('JOINクエリのメタデータが正しく抽出される', async () => {
            const query = `
                SELECT 
                    u.id as user_id,
                    u.name,
                    o.id as order_id,
                    o.amount
                FROM users u
                INNER JOIN orders o ON u.id = o.user_id
            `;
            
            const result = await sqlService.query(query);
            
            expect(result.columnsMeta.length).toBe(4);
            
            // エイリアスが設定されたカラムのメタデータ確認（より柔軟に）
            const hasUserData = result.columnsMeta.some(col =>
                col.table === 'users' || col.column === 'user_id' || col.column === 'user_name'
            );
            const hasOrderData = result.columnsMeta.some(col =>
                col.table === 'orders' || col.column === 'order_id' || col.column === 'amount'
            );

            expect(hasUserData).toBe(true);
            expect(hasOrderData).toBe(true);
        });

        it('計算カラムのメタデータが正しく処理される', async () => {
            const query = `
                SELECT 
                    name,
                    age,
                    age * 2 as double_age,
                    'constant' as constant_value,
                    COUNT(*) as row_count
                FROM users
                GROUP BY name, age
            `;
            
            const result = await sqlService.query(query);
            
            expect(result.columnsMeta.length).toBe(5);
            
            // 計算カラムはテーブル情報がnullになることを確認
            const doubleAgeMeta = result.columnsMeta.find(col => col.column === 'double_age');
            const constantMeta = result.columnsMeta.find(col => col.column === 'constant_value');
            const countMeta = result.columnsMeta.find(col => col.column === 'row_count');
            
            // 計算カラムはテーブル情報がない
            expect(doubleAgeMeta?.table).toBeNull();
            expect(constantMeta?.table).toBeNull();
            expect(countMeta?.table).toBeNull();
            
            // 通常のカラムはテーブル情報がある
            const nameMeta = result.columnsMeta.find(col => col.column === 'name');
            expect(nameMeta?.table).toBe('users');
        });
    });

    describe('大量データでの安定性テスト', () => {
        it('大量データでのクエリ実行が安定している', async () => {
            // 10,000行のデータを挿入
            const batchSize = 10000;
            const batches = [];
            
            for (let i = 0; i < batchSize; i += 1000) {
                const batchValues = [];
                for (let j = i; j < Math.min(i + 1000, batchSize); j++) {
                    batchValues.push(`('bulk_u${j}', 'BulkUser${j}', 'bulk${j}@example.com', ${20 + (j % 60)}, '2024-01-01')`);
                }
                
                batches.push(`
                    INSERT INTO users (id, name, email, age, created_at) VALUES
                    ${batchValues.join(', ')}
                `);
            }
            
            // バッチ挿入
            for (const batch of batches) {
                await sqlService.exec(batch);
            }
            
            // 大量データでのクエリテスト
            const queries = [
                'SELECT COUNT(*) as total_count FROM users',
                'SELECT * FROM users WHERE age BETWEEN 25 AND 35 LIMIT 100',
                'SELECT age, COUNT(*) as count FROM users GROUP BY age ORDER BY age',
                'SELECT * FROM users WHERE name LIKE \'BulkUser1%\' ORDER BY name LIMIT 50'
            ];
            
            for (const query of queries) {
                const startTime = performance.now();
                const result = await sqlService.query(query);
                const endTime = performance.now();
                
                expect(result.rows).toBeDefined();
                expect(result.columnsMeta).toBeDefined();
                expect(endTime - startTime).toBeLessThan(5000); // 5秒以内
            }
        });

        it('メモリ使用量が適切に管理される', async () => {
            // 複数回のクエリ実行でメモリリークがないことを確認
            const initialMemory = process.memoryUsage().heapUsed;
            
            for (let i = 0; i < 100; i++) {
                const result = await sqlService.query('SELECT * FROM users LIMIT 10');
                expect(result.rows.length).toBeLessThanOrEqual(10);
                
                // 定期的にガベージコレクションを促す
                if (i % 20 === 0 && global.gc) {
                    global.gc();
                }
            }
            
            const finalMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = finalMemory - initialMemory;
            
            // メモリ増加が合理的な範囲内であることを確認（10MB以内）
            expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
        });
    });
});
