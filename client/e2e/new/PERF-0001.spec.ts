/** @feature PERF-0001
 * パフォーマンステスト
 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("PERF-0001: パフォーマンステスト", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [], false, true);
        await page.goto("/join-table", { waitUntil: "domcontentloaded" });

        // ページが完全に読み込まれるまで待機
        await page.waitForFunction(() => {
            return (window as any).__JOIN_TABLE__ &&
                (window as any).__JOIN_TABLE__.fluid &&
                (window as any).__JOIN_TABLE__.store &&
                (window as any).__JOIN_TABLE__.sql;
        }, { timeout: 30000 });

        // SQLiteとFluidの初期化が完了するまで待機
        await page.waitForFunction(async () => {
            const joinTable = (window as any).__JOIN_TABLE__;
            if (!joinTable?.sql || !joinTable?.fluid) return false;

            try {
                // SQLiteが初期化されているかテスト
                await joinTable.sql.query("SELECT 1");
                // Fluidコンテナが初期化されているかテスト
                return joinTable.fluid.container && joinTable.fluid.tables;
            }
            catch {
                return false;
            }
        }, { timeout: 30000 });

        // tblテーブルが存在することを確認し、必要に応じて作成
        await page.evaluate(async () => {
            const sql = (window as any).__JOIN_TABLE__?.sql;
            if (!sql) return;

            try {
                // テーブルの存在確認
                await sql.query("SELECT 1 FROM tbl LIMIT 1");
            }
            catch {
                // テーブルが存在しない場合は作成
                await sql.exec("CREATE TABLE tbl(id TEXT PRIMARY KEY, value TEXT, num INTEGER)");
                await sql.exec("INSERT INTO tbl VALUES('1','a',1),('2','b',2)");
            }
        });
    });

    test("large dataset performance", async ({ page }) => {
        // 大量データの処理パフォーマンステスト
        const performanceResult = await page.evaluate(async () => {
            const sql = (window as any).__JOIN_TABLE__?.sql;
            if (!sql) return null;

            // 既存データをクリア
            await sql.exec("DELETE FROM tbl");

            const startTime = performance.now();
            const batchSize = 100;
            const totalRecords = 1000;

            // バッチでデータを挿入
            for (let i = 0; i < totalRecords; i += batchSize) {
                const values = [];
                for (let j = 0; j < batchSize && (i + j) < totalRecords; j++) {
                    const id = i + j;
                    values.push(`('perf_${id}','Performance Test ${id}',${Math.floor(Math.random() * 1000)})`);
                }
                await sql.exec(`INSERT INTO tbl VALUES ${values.join(",")}`);
            }

            const insertTime = performance.now() - startTime;

            // クエリパフォーマンステスト
            const queryStartTime = performance.now();
            const result = await sql.query("SELECT COUNT(*) as count FROM tbl");
            const queryTime = performance.now() - queryStartTime;

            // 集計クエリパフォーマンステスト
            const aggregateStartTime = performance.now();
            await sql.query("SELECT value, COUNT(*) as count, AVG(num) as avg_num FROM tbl GROUP BY value LIMIT 10");
            const aggregateTime = performance.now() - aggregateStartTime;

            return {
                totalRecords,
                insertTime,
                queryTime,
                aggregateTime,
                recordCount: result.rows[0].count,
            };
        });

        expect(performanceResult).toBeDefined();
        expect(performanceResult.recordCount).toBe(1000);
        expect(performanceResult.insertTime).toBeLessThan(10000); // 10秒以内
        expect(performanceResult.queryTime).toBeLessThan(100); // 100ms以内
        expect(performanceResult.aggregateTime).toBeLessThan(500); // 500ms以内
    });

    test("grid rendering performance", async ({ page }) => {
        // グリッド描画パフォーマンステスト
        const renderingResult = await page.evaluate(async () => {
            const sql = (window as any).__JOIN_TABLE__?.sql;
            if (!sql) return null;

            // 中程度のデータセットを作成
            await sql.exec("DELETE FROM tbl");
            for (let i = 0; i < 500; i++) {
                await sql.exec(`INSERT INTO tbl VALUES('grid_${i}','Grid Test ${i}',${i})`);
            }

            const store = (window as any).__JOIN_TABLE__?.store;
            if (!store || !store.run) return null;

            // ストア更新のパフォーマンス測定
            const storeStartTime = performance.now();
            await store.run();
            const storeTime = performance.now() - storeStartTime;

            return {
                dataSize: 500,
                storeUpdateTime: storeTime,
            };
        });

        expect(renderingResult).toBeDefined();
        expect(renderingResult.storeUpdateTime).toBeLessThan(2000); // 2秒以内

        // グリッドが表示されるまでの時間を測定
        const gridRenderTime = await page.evaluate(() => {
            return new Promise(resolve => {
                const startTime = performance.now();
                const checkGrid = () => {
                    const gridCells = document.querySelectorAll('.wx-cell[role="gridcell"]');
                    if (gridCells.length > 0) {
                        resolve(performance.now() - startTime);
                    }
                    else {
                        setTimeout(checkGrid, 10);
                    }
                };
                checkGrid();
                setTimeout(() => resolve(-1), 5000); // タイムアウト
            });
        });

        expect(gridRenderTime).toBeGreaterThan(0);
        expect(gridRenderTime).toBeLessThan(3000); // 3秒以内
    });

    test("chart rendering performance", async ({ page }) => {
        // チャート描画パフォーマンステスト
        const chartPerformance = await page.evaluate(async () => {
            const sql = (window as any).__JOIN_TABLE__?.sql;
            if (!sql) return null;

            // チャート用データを作成
            await sql.exec("DELETE FROM tbl");
            const categories = ["A", "B", "C", "D", "E"];
            for (let i = 0; i < 200; i++) {
                const category = categories[i % categories.length];
                await sql.exec(`INSERT INTO tbl VALUES('chart_${i}','${category}',${Math.floor(Math.random() * 100)})`);
            }

            const store = (window as any).__JOIN_TABLE__?.store;
            if (!store || !store.run) return null;

            const startTime = performance.now();
            await store.run();

            // チャートが更新されるまで待機
            return new Promise(resolve => {
                const checkChart = () => {
                    const chartEl = document.querySelector('[data-testid="chart-panel"]');
                    const chart = chartEl?._echarts_instance_;
                    if (chart) {
                        const option = chart.getOption();
                        if (
                            option.series && option.series[0] && option.series[0].data &&
                            option.series[0].data.length > 0
                        ) {
                            resolve({
                                dataSize: 200,
                                renderTime: performance.now() - startTime,
                                chartDataLength: option.series[0].data.length,
                            });
                            return;
                        }
                    }
                    setTimeout(checkChart, 10);
                };
                checkChart();
                setTimeout(() => resolve({ error: "timeout" }), 10000);
            });
        });

        expect(chartPerformance).toBeDefined();
        expect(chartPerformance.error).toBeUndefined();
        expect(chartPerformance.renderTime).toBeLessThan(5000); // 5秒以内
        expect(chartPerformance.chartDataLength).toBeGreaterThan(0);
    });

    test("memory usage monitoring", async ({ page }) => {
        // メモリ使用量の監視
        const memoryResult = await page.evaluate(async () => {
            const sql = (window as any).__JOIN_TABLE__?.sql;
            if (!sql) return null;

            // 初期メモリ使用量
            const initialMemory = performance.memory ? {
                used: performance.memory.usedJSHeapSize,
                total: performance.memory.totalJSHeapSize,
                limit: performance.memory.jsHeapSizeLimit,
            } : null;

            // 大量データを作成
            await sql.exec("DELETE FROM tbl");
            for (let i = 0; i < 1000; i++) {
                await sql.exec(`INSERT INTO tbl VALUES('mem_${i}','Memory Test ${i}',${i})`);
            }

            const store = (window as any).__JOIN_TABLE__?.store;
            if (store && store.run) {
                await store.run();
            }

            // データ作成後のメモリ使用量
            const afterDataMemory = performance.memory ? {
                used: performance.memory.usedJSHeapSize,
                total: performance.memory.totalJSHeapSize,
                limit: performance.memory.jsHeapSizeLimit,
            } : null;

            // ガベージコレクションを促す
            if (window.gc) {
                window.gc();
            }

            // GC後のメモリ使用量
            const afterGCMemory = performance.memory ? {
                used: performance.memory.usedJSHeapSize,
                total: performance.memory.totalJSHeapSize,
                limit: performance.memory.jsHeapSizeLimit,
            } : null;

            return {
                initialMemory,
                afterDataMemory,
                afterGCMemory,
                memoryIncrease: afterDataMemory && initialMemory ?
                    afterDataMemory.used - initialMemory.used : null,
            };
        });

        expect(memoryResult).toBeDefined();

        if (memoryResult.memoryIncrease !== null) {
            // メモリ増加量が合理的な範囲内であることを確認
            expect(memoryResult.memoryIncrease).toBeLessThan(50 * 1024 * 1024); // 50MB以内
        }
    });

    test("concurrent operations performance", async ({ page, context }) => {
        // 並行操作のパフォーマンステスト
        const page2 = await context.newPage();
        await page2.goto("/join-table", { waitUntil: "domcontentloaded" });

        await page2.waitForFunction(() => {
            return (window as any).__JOIN_TABLE__ &&
                (window as any).__JOIN_TABLE__.fluid &&
                (window as any).__JOIN_TABLE__.store &&
                (window as any).__JOIN_TABLE__.sql;
        }, { timeout: 30000 });

        // page2でもSQLiteとFluidの初期化が完了するまで待機
        await page2.waitForFunction(async () => {
            const joinTable = (window as any).__JOIN_TABLE__;
            if (!joinTable?.sql || !joinTable?.fluid) return false;

            try {
                // SQLiteが初期化されているかテスト
                await joinTable.sql.query("SELECT 1");
                // Fluidコンテナが初期化されているかテスト
                return joinTable.fluid.container && joinTable.fluid.tables;
            }
            catch {
                return false;
            }
        }, { timeout: 30000 });

        // page2でもtblテーブルが存在することを確認し、必要に応じて作成
        await page2.evaluate(async () => {
            const sql = (window as any).__JOIN_TABLE__?.sql;
            if (!sql) return;

            try {
                // テーブルの存在確認
                await sql.query("SELECT 1 FROM tbl LIMIT 1");
            }
            catch {
                // テーブルが存在しない場合は作成
                await sql.exec("CREATE TABLE tbl(id TEXT PRIMARY KEY, value TEXT, num INTEGER)");
                await sql.exec("INSERT INTO tbl VALUES('1','a',1),('2','b',2)");
            }
        });

        const concurrentResult = await Promise.all([
            page.evaluate(async () => {
                const sql = (window as any).__JOIN_TABLE__?.sql;
                if (!sql) return null;

                const startTime = performance.now();
                for (let i = 0; i < 100; i++) {
                    await sql.exec(`INSERT INTO tbl VALUES('concurrent1_${i}','User1 Data ${i}',${i})`);
                }

                const store = (window as any).__JOIN_TABLE__?.store;
                if (store && store.run) {
                    await store.run();
                }

                return {
                    user: "user1",
                    operations: 100,
                    time: performance.now() - startTime,
                };
            }),
            page2.evaluate(async () => {
                const sql = (window as any).__JOIN_TABLE__?.sql;
                if (!sql) return null;

                const startTime = performance.now();
                for (let i = 0; i < 100; i++) {
                    await sql.exec(`INSERT INTO tbl VALUES('concurrent2_${i}','User2 Data ${i}',${i + 1000})`);
                }

                const store = (window as any).__JOIN_TABLE__?.store;
                if (store && store.run) {
                    await store.run();
                }

                return {
                    user: "user2",
                    operations: 100,
                    time: performance.now() - startTime,
                };
            }),
        ]);

        expect(concurrentResult).toHaveLength(2);
        expect(concurrentResult[0].time).toBeLessThan(10000); // 10秒以内
        expect(concurrentResult[1].time).toBeLessThan(10000); // 10秒以内

        // 各ページでデータが正しく保存されていることを確認
        const page1DataCount = await page.evaluate(async () => {
            const sql = (window as any).__JOIN_TABLE__?.sql;
            const result = await sql.query("SELECT COUNT(*) as count FROM tbl WHERE id LIKE 'concurrent1_%'");
            return result.rows[0].count;
        });

        const page2DataCount = await page2.evaluate(async () => {
            const sql = (window as any).__JOIN_TABLE__?.sql;
            const result = await sql.query("SELECT COUNT(*) as count FROM tbl WHERE id LIKE 'concurrent2_%'");
            return result.rows[0].count;
        });

        expect(page1DataCount).toBe(100); // page1で100件
        expect(page2DataCount).toBe(100); // page2で100件
    });

    test("scroll performance with large dataset", async ({ page }) => {
        // 大量データでのスクロールパフォーマンス
        await page.evaluate(async () => {
            const sql = (window as any).__JOIN_TABLE__?.sql;
            if (!sql) return;

            // 大量データを作成
            await sql.exec("DELETE FROM tbl");
            for (let i = 0; i < 2000; i++) {
                await sql.exec(`INSERT INTO tbl VALUES('scroll_${i}','Scroll Test ${i}',${i})`);
            }

            const store = (window as any).__JOIN_TABLE__?.store;
            if (store && store.run) {
                await store.run();
            }
        });

        // グリッドが表示されるまで待機
        await page.waitForSelector('[data-testid="editable-grid"]', { timeout: 10000 });

        // スクロールパフォーマンスを測定
        const scrollPerformance = await page.evaluate(() => {
            return new Promise(resolve => {
                const grid = document.querySelector('[data-testid="editable-grid"]');
                if (!grid) {
                    resolve({ error: "Grid not found" });
                    return;
                }

                const startTime = performance.now();
                let scrollCount = 0;
                const maxScrolls = 10;

                const scrollInterval = setInterval(() => {
                    grid.scrollTop += 100;
                    scrollCount++;

                    if (scrollCount >= maxScrolls) {
                        clearInterval(scrollInterval);
                        resolve({
                            scrollCount,
                            totalTime: performance.now() - startTime,
                            avgTimePerScroll: (performance.now() - startTime) / maxScrolls,
                        });
                    }
                }, 100);
            });
        });

        expect(scrollPerformance.error).toBeUndefined();
        expect(scrollPerformance.avgTimePerScroll).toBeLessThan(50); // 50ms以内/スクロール
    });

    test("fluid synchronization performance", async ({ page, context }) => {
        // Fluid同期のパフォーマンステスト
        const page2 = await context.newPage();
        await page2.goto("/join-table", { waitUntil: "domcontentloaded" });

        await page2.waitForFunction(() => {
            return (window as any).__JOIN_TABLE__ &&
                (window as any).__JOIN_TABLE__.fluid &&
                (window as any).__JOIN_TABLE__.store &&
                (window as any).__JOIN_TABLE__.sql;
        }, { timeout: 30000 });

        // page2でもSQLiteとFluidの初期化が完了するまで待機
        await page2.waitForFunction(async () => {
            const joinTable = (window as any).__JOIN_TABLE__;
            if (!joinTable?.sql || !joinTable?.fluid) return false;

            try {
                // SQLiteが初期化されているかテスト
                await joinTable.sql.query("SELECT 1");
                // Fluidコンテナが初期化されているかテスト
                return joinTable.fluid.container && joinTable.fluid.tables;
            }
            catch {
                return false;
            }
        }, { timeout: 30000 });

        // page2でもtblテーブルが存在することを確認し、必要に応じて作成
        await page2.evaluate(async () => {
            const sql = (window as any).__JOIN_TABLE__?.sql;
            if (!sql) return;

            try {
                // テーブルの存在確認
                await sql.query("SELECT 1 FROM tbl LIMIT 1");
            }
            catch {
                // テーブルが存在しない場合は作成
                await sql.exec("CREATE TABLE tbl(id TEXT PRIMARY KEY, value TEXT, num INTEGER)");
                await sql.exec("INSERT INTO tbl VALUES('1','a',1),('2','b',2)");
            }
        });

        const syncPerformance = await page.evaluate(async () => {
            const sql = (window as any).__JOIN_TABLE__?.sql;
            if (!sql) return null;

            const startTime = performance.now();

            // 複数の変更を連続して実行
            for (let i = 0; i < 50; i++) {
                await sql.exec(`INSERT INTO tbl VALUES('sync_${i}','Sync Test ${i}',${i})`);
            }

            const store = (window as any).__JOIN_TABLE__?.store;
            if (store && store.run) {
                await store.run();
            }

            return {
                operations: 50,
                time: performance.now() - startTime,
            };
        });

        // 2番目のページで同期が完了するまでの時間を測定
        const syncTime = await page2.evaluate(() => {
            return new Promise(resolve => {
                const startTime = performance.now();
                const checkSync = () => {
                    const sql = (window as any).__JOIN_TABLE__?.sql;
                    if (!sql) {
                        setTimeout(checkSync, 100);
                        return;
                    }

                    sql.query("SELECT COUNT(*) as count FROM tbl WHERE id LIKE 'sync_%'").then(result => {
                        if (result.rows[0].count >= 50) {
                            resolve(performance.now() - startTime);
                        }
                        else {
                            setTimeout(checkSync, 100);
                        }
                    });
                };
                checkSync();
                setTimeout(() => resolve(-1), 15000); // 15秒でタイムアウト
            });
        });

        expect(syncPerformance.time).toBeLessThan(5000); // 5秒以内
        expect(syncTime).toBeGreaterThan(0);
        expect(syncTime).toBeLessThan(10000); // 10秒以内で同期完了
    });
});
