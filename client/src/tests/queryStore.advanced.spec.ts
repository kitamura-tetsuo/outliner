/** @feature TBL-0005
 *  Title   : queryStore.ts の詳細テスト
 *  Source  : docs/client-features.yaml
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { createQueryStore } from '../services/queryStore';
import { SqlService } from '../services/sqlService';

describe('QueryStore Advanced Tests', () => {
    let sqlService: SqlService;
    let queryStore: ReturnType<typeof createQueryStore>;

    beforeEach(async () => {
        sqlService = new SqlService();
        
        // テスト用のテーブルとデータを作成
        await sqlService.exec(`
            CREATE TABLE test_users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT,
                age INTEGER,
                created_at TEXT
            )
        `);
        
        await sqlService.exec(`
            CREATE TABLE test_orders (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                product_name TEXT,
                amount REAL,
                order_date TEXT,
                FOREIGN KEY (user_id) REFERENCES test_users(id)
            )
        `);
        
        // テストデータの挿入
        await sqlService.exec(`
            INSERT INTO test_users (id, name, email, age, created_at) VALUES
            ('u1', 'Alice', 'alice@test.com', 25, '2024-01-01'),
            ('u2', 'Bob', 'bob@test.com', 30, '2024-01-02'),
            ('u3', 'Charlie', 'charlie@test.com', 35, '2024-01-03')
        `);
        
        await sqlService.exec(`
            INSERT INTO test_orders (id, user_id, product_name, amount, order_date) VALUES
            ('o1', 'u1', 'Product A', 100.50, '2024-02-01'),
            ('o2', 'u1', 'Product B', 200.75, '2024-02-02'),
            ('o3', 'u2', 'Product C', 150.25, '2024-02-03')
        `);
        
        queryStore = createQueryStore(sqlService, 'SELECT * FROM test_users');
    });

    afterEach(async () => {
        // クリーンアップ
        if (sqlService) {
            try {
                await sqlService.exec('DROP TABLE IF EXISTS test_orders');
                await sqlService.exec('DROP TABLE IF EXISTS test_users');
            } catch (error) {
                // エラーは無視
            }
        }
    });

    describe('複雑なSQLクエリの処理テスト', () => {
        it('JOINクエリが正しく処理される', async () => {
            const joinQuery = `
                SELECT 
                    u.id as user_id,
                    u.name as user_name,
                    o.id as order_id,
                    o.product_name,
                    o.amount
                FROM test_users u
                LEFT JOIN test_orders o ON u.id = o.user_id
                ORDER BY u.name, o.order_date
            `;
            
            await queryStore.run(joinQuery);
            
            const result = get(queryStore);
            
            expect(result.rows).toBeDefined();
            expect(result.rows.length).toBeGreaterThan(0);
            expect(result.columnsMeta).toBeDefined();
            expect(result.columnsMeta.length).toBe(5);
            
            // メタデータの確認（より柔軟に）
            const hasUserData = result.columnsMeta.some(col =>
                col.table === 'test_users' || col.column === 'user_id' || col.column === 'user_name'
            );
            const hasOrderData = result.columnsMeta.some(col =>
                col.table === 'test_orders' || col.column === 'order_id' || col.column === 'amount'
            );

            expect(hasUserData).toBe(true);
            expect(hasOrderData).toBe(true);
        });

        it('集計クエリが正しく処理される', async () => {
            const aggregateQuery = `
                SELECT 
                    u.name,
                    COUNT(o.id) as order_count,
                    SUM(o.amount) as total_amount,
                    AVG(o.amount) as avg_amount
                FROM test_users u
                LEFT JOIN test_orders o ON u.id = o.user_id
                GROUP BY u.id, u.name
                ORDER BY total_amount DESC
            `;
            
            await queryStore.run(aggregateQuery);
            
            const result = get(queryStore);
            
            expect(result.rows).toBeDefined();
            expect(result.rows.length).toBe(3); // 3人のユーザー
            expect(result.columnsMeta.length).toBe(4);
            
            // 集計結果の確認
            const aliceRow = result.rows.find(row => row.name === 'Alice');
            expect(aliceRow).toBeDefined();
            expect(aliceRow.order_count).toBe(2);
            expect(aliceRow.total_amount).toBeCloseTo(301.25, 2);
        });

        it('サブクエリが正しく処理される', async () => {
            const subQuery = `
                SELECT 
                    u.name,
                    u.age,
                    (SELECT COUNT(*) FROM test_orders o WHERE o.user_id = u.id) as order_count,
                    (SELECT MAX(o.amount) FROM test_orders o WHERE o.user_id = u.id) as max_order_amount
                FROM test_users u
                WHERE u.age > (SELECT AVG(age) FROM test_users)
                ORDER BY u.age DESC
            `;
            
            await queryStore.run(subQuery);
            
            const result = get(queryStore);
            
            expect(result.rows).toBeDefined();
            expect(result.columnsMeta.length).toBe(4);
            
            // 平均年齢より上のユーザーのみが返されることを確認
            result.rows.forEach(row => {
                expect(row.age).toBeGreaterThan(30); // 平均年齢30より上
            });
        });

        it('CASE文を含むクエリが正しく処理される', async () => {
            const caseQuery = `
                SELECT 
                    name,
                    age,
                    CASE 
                        WHEN age < 30 THEN 'Young'
                        WHEN age < 40 THEN 'Middle'
                        ELSE 'Senior'
                    END as age_group,
                    CASE 
                        WHEN email IS NOT NULL THEN 'Has Email'
                        ELSE 'No Email'
                    END as email_status
                FROM test_users
                ORDER BY age
            `;
            
            await queryStore.run(caseQuery);
            
            const result = get(queryStore);
            
            expect(result.rows).toBeDefined();
            expect(result.rows.length).toBe(3);
            expect(result.columnsMeta.length).toBe(4);
            
            // CASE文の結果を確認
            const aliceRow = result.rows.find(row => row.name === 'Alice');
            expect(aliceRow.age_group).toBe('Young');
            expect(aliceRow.email_status).toBe('Has Email');
        });
    });

    describe('エラーハンドリングのテスト', () => {
        it('構文エラーが適切にハンドリングされる', async () => {
            const invalidQuery = 'SELECT * FORM test_users'; // 意図的な構文エラー
            
            await expect(queryStore.run(invalidQuery)).rejects.toThrow();
            
            // ストアの状態が変更されていないことを確認
            const result = get(queryStore);
            expect(result.rows).toEqual([]);
            expect(result.columnsMeta).toEqual([]);
        });

        it('存在しないテーブルへのクエリがエラーになる', async () => {
            const invalidQuery = 'SELECT * FROM non_existent_table';
            
            await expect(queryStore.run(invalidQuery)).rejects.toThrow();
        });

        it('空のクエリが適切に処理される', async () => {
            await queryStore.run('');
            
            const result = get(queryStore);
            expect(result.rows).toEqual([]);
            expect(result.columnsMeta).toEqual([]);
        });

        it('null/undefinedクエリが適切に処理される', async () => {
            await queryStore.run(null as any);
            
            const result = get(queryStore);
            expect(result.rows).toEqual([]);
            expect(result.columnsMeta).toEqual([]);
        });
    });

    describe('ストアの状態管理テスト', () => {
        it('初期状態が正しく設定される', () => {
            const newStore = createQueryStore(sqlService, '');
            const result = get(newStore);
            
            expect(result.rows).toEqual([]);
            expect(result.columnsMeta).toEqual([]);
        });

        it('クエリ実行後にストアが更新される', async () => {
            const query = 'SELECT name, age FROM test_users WHERE age > 25';
            
            await queryStore.run(query);
            
            const result = get(queryStore);
            
            expect(result.rows.length).toBe(2); // Bob and Charlie
            expect(result.columnsMeta.length).toBe(2);
        });

        it('複数回のクエリ実行で状態が正しく更新される', async () => {
            // 最初のクエリ
            await queryStore.run('SELECT * FROM test_users');
            let result = get(queryStore);
            expect(result.rows.length).toBe(3);
            
            // 2回目のクエリ
            await queryStore.run('SELECT * FROM test_users WHERE age > 30');
            result = get(queryStore);
            expect(result.rows.length).toBe(1); // Charlie (35歳) のみ
            
            // 3回目のクエリ
            await queryStore.run('SELECT name FROM test_users WHERE name = \'Alice\'');
            result = get(queryStore);
            expect(result.rows.length).toBe(1);
            expect(result.columnsMeta.length).toBe(1);
        });
    });

    describe('リアクティブな更新のテスト', () => {
        it('ストアの変更が購読者に通知される', async () => {
            const updates: any[] = [];
            
            const unsubscribe = queryStore.subscribe(value => {
                updates.push(JSON.parse(JSON.stringify(value)));
            });
            
            await queryStore.run('SELECT * FROM test_users');
            
            expect(updates.length).toBeGreaterThan(0);
            
            const lastUpdate = updates[updates.length - 1];
            expect(lastUpdate.rows.length).toBe(3);
            expect(lastUpdate.columnsMeta.length).toBeGreaterThan(0);
            
            unsubscribe();
        });

        it('複数の購読者が同時に更新を受け取る', async () => {
            const updates1: any[] = [];
            const updates2: any[] = [];
            
            const unsubscribe1 = queryStore.subscribe(value => {
                updates1.push(value);
            });
            
            const unsubscribe2 = queryStore.subscribe(value => {
                updates2.push(value);
            });
            
            await queryStore.run('SELECT name FROM test_users');
            
            expect(updates1.length).toBeGreaterThan(0);
            expect(updates2.length).toBeGreaterThan(0);
            expect(updates1.length).toBe(updates2.length);
            
            unsubscribe1();
            unsubscribe2();
        });

        it('購読解除後は更新を受け取らない', async () => {
            const updates: any[] = [];
            
            const unsubscribe = queryStore.subscribe(value => {
                updates.push(value);
            });
            
            await queryStore.run('SELECT * FROM test_users');
            const updateCountAfterFirst = updates.length;
            
            unsubscribe();
            
            await queryStore.run('SELECT name FROM test_users');
            
            expect(updates.length).toBe(updateCountAfterFirst);
        });
    });

    describe('メモリリークのテスト', () => {
        it('大量のクエリ実行でメモリリークが発生しない', async () => {
            const initialMemory = process.memoryUsage().heapUsed;
            
            // 100回のクエリ実行
            for (let i = 0; i < 100; i++) {
                await queryStore.run(`SELECT * FROM test_users WHERE age > ${20 + (i % 20)}`);
                
                // 定期的にガベージコレクションを促す
                if (i % 20 === 0 && global.gc) {
                    global.gc();
                }
            }
            
            const finalMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = finalMemory - initialMemory;
            
            // メモリ増加が合理的な範囲内であることを確認（5MB以内）
            expect(memoryIncrease).toBeLessThan(5 * 1024 * 1024);
        });

        it('購読者の追加・削除でメモリリークが発生しない', async () => {
            const initialMemory = process.memoryUsage().heapUsed;
            
            // 100回の購読・購読解除
            for (let i = 0; i < 100; i++) {
                const unsubscribe = queryStore.subscribe(() => {});
                await queryStore.run('SELECT * FROM test_users LIMIT 1');
                unsubscribe();
                
                if (i % 20 === 0 && global.gc) {
                    global.gc();
                }
            }
            
            const finalMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = finalMemory - initialMemory;
            
            // メモリ増加が合理的な範囲内であることを確認（3MB以内）
            expect(memoryIncrease).toBeLessThan(3 * 1024 * 1024);
        });
    });

    describe('パフォーマンステスト', () => {
        it('大量データでのクエリ実行が適切な時間内に完了する', async () => {
            // 大量データを挿入
            const batchSize = 1000;
            const insertValues = [];
            
            for (let i = 0; i < batchSize; i++) {
                insertValues.push(`('perf_u${i}', 'PerfUser${i}', 'perf${i}@test.com', ${20 + (i % 50)}, '2024-01-01')`);
            }
            
            await sqlService.exec(`
                INSERT INTO test_users (id, name, email, age, created_at) VALUES
                ${insertValues.join(', ')}
            `);
            
            // クエリ実行時間を測定
            const startTime = performance.now();
            await queryStore.run('SELECT * FROM test_users WHERE age BETWEEN 30 AND 40 ORDER BY name');
            const endTime = performance.now();
            
            const executionTime = endTime - startTime;
            const result = get(queryStore);
            
            expect(result.rows.length).toBeGreaterThan(0);
            expect(executionTime).toBeLessThan(2000); // 2秒以内
            
            console.log(`QueryStore execution time: ${executionTime.toFixed(2)}ms for ${result.rows.length} rows`);
        });

        it('複雑なクエリのパフォーマンスが適切である', async () => {
            const complexQuery = `
                SELECT 
                    u.name,
                    u.age,
                    COUNT(o.id) as order_count,
                    SUM(o.amount) as total_amount,
                    AVG(o.amount) as avg_amount,
                    MAX(o.amount) as max_amount,
                    MIN(o.amount) as min_amount
                FROM test_users u
                LEFT JOIN test_orders o ON u.id = o.user_id
                WHERE u.age BETWEEN 20 AND 50
                GROUP BY u.id, u.name, u.age
                HAVING COUNT(o.id) >= 0
                ORDER BY total_amount DESC, u.name ASC
            `;
            
            const startTime = performance.now();
            await queryStore.run(complexQuery);
            const endTime = performance.now();
            
            const executionTime = endTime - startTime;
            const result = get(queryStore);
            
            expect(result.rows).toBeDefined();
            expect(result.columnsMeta.length).toBe(7);
            expect(executionTime).toBeLessThan(1000); // 1秒以内
            
            console.log(`Complex query execution time: ${executionTime.toFixed(2)}ms`);
        });
    });

    describe('エッジケースのテスト', () => {
        it('空の結果セットが正しく処理される', async () => {
            await queryStore.run('SELECT * FROM test_users WHERE age > 100');
            
            const result = get(queryStore);
            
            expect(result.rows).toEqual([]);
            expect(result.columnsMeta.length).toBeGreaterThan(0); // メタデータは存在する
        });

        it('NULL値を含むクエリが正しく処理される', async () => {
            // NULL値を含むデータを追加
            await sqlService.exec(`
                INSERT INTO test_users (id, name, email, age, created_at) VALUES
                ('u4', 'David', NULL, NULL, '2024-01-04')
            `);
            
            await queryStore.run('SELECT * FROM test_users WHERE email IS NULL OR age IS NULL');
            
            const result = get(queryStore);
            
            expect(result.rows.length).toBe(1);
            expect(result.rows[0].name).toBe('David');
            expect(result.rows[0].email).toBeNull();
            expect(result.rows[0].age).toBeNull();
        });

        it('特殊文字を含むデータが正しく処理される', async () => {
            await sqlService.exec(`
                INSERT INTO test_users (id, name, email, age, created_at) VALUES
                ('u5', 'O''Connor', 'test@"example".com', 25, '2024-01-05')
            `);
            
            await queryStore.run('SELECT * FROM test_users WHERE name LIKE \'%O\'\'Connor%\'');
            
            const result = get(queryStore);
            
            expect(result.rows.length).toBe(1);
            expect(result.rows[0].name).toBe("O'Connor");
        });
    });
});
