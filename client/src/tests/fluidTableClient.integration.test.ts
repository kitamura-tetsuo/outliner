/** @feature TBL-0006
 *  Title   : FluidTableClient の統合テスト
 *  Source  : docs/client-features.yaml
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FluidTableClient } from '../services/fluidClient';

// FluidFrameworkが利用できない環境でのテストをスキップ
const isFluidAvailable = () => {
    try {
        return typeof window !== 'undefined' || process.env.NODE_ENV === 'test';
    } catch {
        return false;
    }
};

describe.skip('FluidTableClient Integration Tests', () => {
    let client1: FluidTableClient;
    let client2: FluidTableClient;
    let containerId: string;

    beforeEach(async () => {
        client1 = new FluidTableClient();
        client2 = new FluidTableClient();
    });

    afterEach(async () => {
        // クリーンアップ
        if (client1?.container) {
            try {
                client1.container.dispose();
            } catch (error) {
                // エラーは無視
            }
        }
        if (client2?.container) {
            try {
                client2.container.dispose();
            } catch (error) {
                // エラーは無視
            }
        }
    });

    describe('Fluidコンテナの作成と接続テスト', () => {
        it('新しいコンテナが正しく作成される', async () => {
            containerId = await client1.createContainer();
            
            expect(containerId).toBeDefined();
            expect(typeof containerId).toBe('string');
            expect(containerId.length).toBeGreaterThan(0);
            
            expect(client1.container).toBeDefined();
            expect(client1.containerId).toBe(containerId);
            expect(client1.tables).toBeDefined();
        });

        it('既存のコンテナに接続できる', async () => {
            // 最初のクライアントでコンテナを作成
            containerId = await client1.createContainer();
            
            // 2番目のクライアントで同じコンテナに接続
            await client2.loadContainer(containerId);
            
            expect(client2.container).toBeDefined();
            expect(client2.containerId).toBe(containerId);
            expect(client2.tables).toBeDefined();
        });

        it('コンテナの接続状態が正しく管理される', async () => {
            containerId = await client1.createContainer();
            
            // コンテナが接続されていることを確認
            expect(client1.container).toBeDefined();
            
            // 接続状態の確認（Fluidコンテナの内部状態）
            const connectionState = client1.container.connectionState;
            expect(connectionState).toBeDefined();
        });
    });

    describe('テーブルデータの同期テスト', () => {
        beforeEach(async () => {
            containerId = await client1.createContainer();
            await client2.loadContainer(containerId);
        });

        it('セルの更新が正しく同期される', async () => {
            const updateData = {
                tableId: 'test_table',
                rowId: 'row1',
                column: 'name',
                value: 'Test Value'
            };
            
            // client1でセルを更新
            client1.updateCell(updateData);
            
            // 同期を待機
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // client2でデータを確認
            const table = client2.tables?.get('test_table');
            expect(table).toBeDefined();
            
            const row = table?.get('row1');
            expect(row).toBeDefined();
            
            const value = row?.get('name');
            expect(value).toBe('Test Value');
        });

        it('複数のセル更新が正しく同期される', async () => {
            const updates = [
                { tableId: 'users', rowId: 'u1', column: 'name', value: 'Alice' },
                { tableId: 'users', rowId: 'u1', column: 'email', value: 'alice@test.com' },
                { tableId: 'users', rowId: 'u2', column: 'name', value: 'Bob' },
                { tableId: 'orders', rowId: 'o1', column: 'amount', value: 100.50 }
            ];
            
            // client1で複数の更新を実行
            updates.forEach(update => {
                client1.updateCell(update);
            });
            
            // 同期を待機
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // client2で各更新を確認
            for (const update of updates) {
                const table = client2.tables?.get(update.tableId);
                expect(table).toBeDefined();
                
                const row = table?.get(update.rowId);
                expect(row).toBeDefined();
                
                const value = row?.get(update.column);
                expect(value).toBe(update.value);
            }
        });

        it('新しいテーブルの作成が同期される', async () => {
            const tableId = 'new_table';
            const rowId = 'new_row';
            const column = 'new_column';
            const value = 'new_value';
            
            // client1で新しいテーブルにデータを追加
            client1.updateCell({ tableId, rowId, column, value });
            
            // 同期を待機
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // client2で新しいテーブルが作成されていることを確認
            const table = client2.tables?.get(tableId);
            expect(table).toBeDefined();
            
            const row = table?.get(rowId);
            expect(row).toBeDefined();
            
            const retrievedValue = row?.get(column);
            expect(retrievedValue).toBe(value);
        });

        it('データの上書き更新が正しく同期される', async () => {
            const updateData = {
                tableId: 'test_table',
                rowId: 'row1',
                column: 'value',
                value: 'initial_value'
            };
            
            // 初期値を設定
            client1.updateCell(updateData);
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // 値を更新
            updateData.value = 'updated_value';
            client1.updateCell(updateData);
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // client2で更新された値を確認
            const table = client2.tables?.get('test_table');
            const row = table?.get('row1');
            const value = row?.get('value');
            
            expect(value).toBe('updated_value');
        });
    });

    describe('複数クライアント間の同期テスト', () => {
        beforeEach(async () => {
            containerId = await client1.createContainer();
            await client2.loadContainer(containerId);
        });

        it('双方向の同期が正しく機能する', async () => {
            // client1からの更新
            client1.updateCell({
                tableId: 'sync_test',
                rowId: 'r1',
                column: 'from_client1',
                value: 'value_from_1'
            });
            
            // client2からの更新
            client2.updateCell({
                tableId: 'sync_test',
                rowId: 'r1',
                column: 'from_client2',
                value: 'value_from_2'
            });
            
            // 同期を待機
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // client1でclient2の更新を確認
            const table1 = client1.tables?.get('sync_test');
            const row1 = table1?.get('r1');
            expect(row1?.get('from_client2')).toBe('value_from_2');
            
            // client2でclient1の更新を確認
            const table2 = client2.tables?.get('sync_test');
            const row2 = table2?.get('r1');
            expect(row2?.get('from_client1')).toBe('value_from_1');
        });

        it('同時更新の競合が適切に処理される', async () => {
            const tableId = 'conflict_test';
            const rowId = 'r1';
            const column = 'value';
            
            // 同時に異なる値で更新
            client1.updateCell({ tableId, rowId, column, value: 'value_from_client1' });
            client2.updateCell({ tableId, rowId, column, value: 'value_from_client2' });
            
            // 同期を待機
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // 両方のクライアントで同じ値になっていることを確認（last-writer-wins）
            const table1 = client1.tables?.get(tableId);
            const row1 = table1?.get(rowId);
            const value1 = row1?.get(column);
            
            const table2 = client2.tables?.get(tableId);
            const row2 = table2?.get(rowId);
            const value2 = row2?.get(column);
            
            expect(value1).toBe(value2);
            expect(value1).toMatch(/value_from_client[12]/);
        });

        it('大量の同時更新が正しく処理される', async () => {
            const tableId = 'bulk_test';
            const updateCount = 50;
            
            // client1から大量の更新
            for (let i = 0; i < updateCount; i++) {
                client1.updateCell({
                    tableId,
                    rowId: `row_${i}`,
                    column: 'value',
                    value: `value_${i}_from_client1`
                });
            }
            
            // client2からも大量の更新
            for (let i = 0; i < updateCount; i++) {
                client2.updateCell({
                    tableId,
                    rowId: `row_${i}`,
                    column: 'other_value',
                    value: `other_value_${i}_from_client2`
                });
            }
            
            // 同期を待機
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // 両方のクライアントで全ての更新が同期されていることを確認
            const table1 = client1.tables?.get(tableId);
            const table2 = client2.tables?.get(tableId);
            
            expect(table1).toBeDefined();
            expect(table2).toBeDefined();
            
            for (let i = 0; i < updateCount; i++) {
                const row1 = table1?.get(`row_${i}`);
                const row2 = table2?.get(`row_${i}`);
                
                expect(row1).toBeDefined();
                expect(row2).toBeDefined();
                
                // 両方のクライアントで同じデータが見えることを確認
                expect(row1?.get('value')).toBe(row2?.get('value'));
                expect(row1?.get('other_value')).toBe(row2?.get('other_value'));
            }
        });
    });

    describe('エラーハンドリングと復旧テスト', () => {
        it('無効なコンテナIDでの接続がエラーになる', async () => {
            const invalidContainerId = 'invalid-container-id';
            
            await expect(client1.loadContainer(invalidContainerId)).rejects.toThrow();
        });

        it('tablesが初期化されていない状態での更新がエラーになる', () => {
            const uninitializedClient = new FluidTableClient();
            
            expect(() => {
                uninitializedClient.updateCell({
                    tableId: 'test',
                    rowId: 'test',
                    column: 'test',
                    value: 'test'
                });
            }).toThrow('tables map not ready');
        });

        it('接続エラー後の復旧処理が正しく動作する', async () => {
            containerId = await client1.createContainer();
            
            // 正常な更新
            client1.updateCell({
                tableId: 'recovery_test',
                rowId: 'r1',
                column: 'value',
                value: 'before_error'
            });
            
            // コンテナを一時的に無効化（シミュレーション）
            const originalContainer = client1.container;
            
            // 再接続をシミュレート
            await client1.loadContainer(containerId);
            
            // 復旧後の更新
            client1.updateCell({
                tableId: 'recovery_test',
                rowId: 'r1',
                column: 'value',
                value: 'after_recovery'
            });
            
            // データが正しく更新されていることを確認
            const table = client1.tables?.get('recovery_test');
            const row = table?.get('r1');
            const value = row?.get('value');
            
            expect(value).toBe('after_recovery');
        });
    });

    describe('パフォーマンステスト', () => {
        beforeEach(async () => {
            containerId = await client1.createContainer();
            await client2.loadContainer(containerId);
        });

        it('大量データの同期パフォーマンスが適切である', async () => {
            const tableId = 'performance_test';
            const dataCount = 1000;
            
            const startTime = performance.now();
            
            // 大量のデータを更新
            for (let i = 0; i < dataCount; i++) {
                client1.updateCell({
                    tableId,
                    rowId: `perf_row_${i}`,
                    column: 'value',
                    value: `perf_value_${i}`
                });
            }
            
            const updateEndTime = performance.now();
            
            // 同期を待機
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const syncEndTime = performance.now();
            
            // client2でデータが同期されていることを確認
            const table = client2.tables?.get(tableId);
            expect(table).toBeDefined();
            
            // ランダムにいくつかの行をチェック
            for (let i = 0; i < 10; i++) {
                const randomIndex = Math.floor(Math.random() * dataCount);
                const row = table?.get(`perf_row_${randomIndex}`);
                expect(row?.get('value')).toBe(`perf_value_${randomIndex}`);
            }
            
            const updateTime = updateEndTime - startTime;
            const totalTime = syncEndTime - startTime;
            
            console.log(`Performance test: ${dataCount} updates in ${updateTime.toFixed(2)}ms, total sync time ${totalTime.toFixed(2)}ms`);
            
            // パフォーマンス要件（調整可能）
            expect(updateTime).toBeLessThan(5000); // 5秒以内で更新完了
            expect(totalTime).toBeLessThan(10000); // 10秒以内で同期完了
        });

        it('メモリ使用量が適切に管理される', async () => {
            const initialMemory = process.memoryUsage().heapUsed;
            
            // 大量のテーブルとデータを作成
            for (let t = 0; t < 10; t++) {
                const tableId = `memory_test_table_${t}`;
                
                for (let r = 0; r < 100; r++) {
                    client1.updateCell({
                        tableId,
                        rowId: `row_${r}`,
                        column: 'data',
                        value: `data_${t}_${r}_${'x'.repeat(100)}` // 長いデータ
                    });
                }
            }
            
            // 同期を待機
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // ガベージコレクションを促す
            if (global.gc) {
                global.gc();
            }
            
            const finalMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = finalMemory - initialMemory;
            
            console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
            
            // メモリ増加が合理的な範囲内であることを確認（50MB以内）
            expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
        });
    });

    describe('データ整合性テスト', () => {
        beforeEach(async () => {
            containerId = await client1.createContainer();
            await client2.loadContainer(containerId);
        });

        it('複雑なデータ構造の同期が正しく機能する', async () => {
            const complexData = {
                tableId: 'complex_test',
                rowId: 'complex_row',
                updates: [
                    { column: 'string_value', value: 'test string' },
                    { column: 'number_value', value: 42 },
                    { column: 'float_value', value: 3.14159 },
                    { column: 'boolean_value', value: true },
                    { column: 'null_value', value: null },
                    { column: 'object_value', value: { nested: 'object', count: 5 } },
                    { column: 'array_value', value: [1, 2, 3, 'four', { five: 5 }] }
                ]
            };
            
            // 複雑なデータを更新
            complexData.updates.forEach(update => {
                client1.updateCell({
                    tableId: complexData.tableId,
                    rowId: complexData.rowId,
                    column: update.column,
                    value: update.value
                });
            });
            
            // 同期を待機
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // client2でデータの整合性を確認
            const table = client2.tables?.get(complexData.tableId);
            const row = table?.get(complexData.rowId);
            
            expect(row).toBeDefined();
            
            complexData.updates.forEach(update => {
                const value = row?.get(update.column);
                if (typeof update.value === 'object' && update.value !== null) {
                    expect(JSON.stringify(value)).toBe(JSON.stringify(update.value));
                } else {
                    expect(value).toBe(update.value);
                }
            });
        });

        it('データの削除と再作成が正しく同期される', async () => {
            const tableId = 'delete_test';
            const rowId = 'test_row';
            const column = 'value';
            
            // データを作成
            client1.updateCell({ tableId, rowId, column, value: 'initial_value' });
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // データを削除（nullで上書き）
            client1.updateCell({ tableId, rowId, column, value: null });
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // データを再作成
            client1.updateCell({ tableId, rowId, column, value: 'recreated_value' });
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // client2で最終状態を確認
            const table = client2.tables?.get(tableId);
            const row = table?.get(rowId);
            const value = row?.get(column);
            
            expect(value).toBe('recreated_value');
        });
    });
});
