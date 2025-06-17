/** @feature ERR-0001
 * エラーハンドリングテスト
 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("ERR-0001: エラーハンドリングテスト", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [], false, true);
    });

    test("handles network connection errors", async ({ page }) => {
        await page.goto("/join-table", { waitUntil: "domcontentloaded" });

        await page.waitForFunction(() => {
            return (window as any).__JOIN_TABLE__ &&
                (window as any).__JOIN_TABLE__.fluid &&
                (window as any).__JOIN_TABLE__.store &&
                (window as any).__JOIN_TABLE__.sql;
        }, { timeout: 10000 });

        // ネットワークを切断
        await page.context().setOffline(true);

        // オフライン状態でデータ操作を試行
        const offlineResult = await page.evaluate(async () => {
            try {
                const sql = (window as any).__JOIN_TABLE__?.sql;
                if (sql) {
                    await sql.exec("INSERT INTO tbl VALUES('offline_test','offline_data',999)");
                    const store = (window as any).__JOIN_TABLE__?.store;
                    if (store && store.run) {
                        await store.run();
                    }
                }
                return { success: true, error: null };
            }
            catch (error) {
                return { success: false, error: error.message };
            }
        });

        // オフライン状態でもローカル操作は成功することを確認
        expect(offlineResult.success).toBe(true);

        // ネットワークエラー表示を確認
        await expect(page.locator('[data-testid="network-error-indicator"]')).toBeVisible();

        // ネットワークを復旧
        await page.context().setOffline(false);

        // 復旧後にエラー表示が消えることを確認
        await expect(page.locator('[data-testid="network-error-indicator"]')).not.toBeVisible({ timeout: 10000 });
    });

    test("handles SQL syntax errors", async ({ page }) => {
        await page.goto("/join-table", { waitUntil: "domcontentloaded" });

        await page.waitForFunction(() => {
            return (window as any).__JOIN_TABLE__ && (window as any).__JOIN_TABLE__.sql;
        }, { timeout: 10000 });

        // 不正なSQLクエリを実行
        const sqlErrorResult = await page.evaluate(async () => {
            try {
                const sql = (window as any).__JOIN_TABLE__?.sql;
                if (sql) {
                    await sql.query("SELECT * FROM non_existent_table WHERE invalid syntax");
                }
                return { success: true, error: null };
            }
            catch (error) {
                return { success: false, error: error.message };
            }
        });

        expect(sqlErrorResult.success).toBe(false);
        expect(sqlErrorResult.error).toBeDefined();
        expect(sqlErrorResult.error).toContain("syntax error");

        // エラーメッセージが表示されることを確認
        await expect(page.locator('[data-testid="sql-error-message"]')).toBeVisible();
    });

    test("handles data corruption gracefully", async ({ page }) => {
        await page.goto("/join-table", { waitUntil: "domcontentloaded" });

        await page.waitForFunction(() => {
            return (window as any).__JOIN_TABLE__ && (window as any).__JOIN_TABLE__.sql;
        }, { timeout: 10000 });

        // データ破損をシミュレート
        const corruptionResult = await page.evaluate(async () => {
            try {
                const sql = (window as any).__JOIN_TABLE__?.sql;
                if (sql) {
                    // 不正なデータ型を挿入
                    await sql.exec("INSERT INTO tbl VALUES('corrupt1', NULL, 'not_a_number')");
                    await sql.exec("INSERT INTO tbl VALUES(NULL, 'null_id', 123)");

                    const store = (window as any).__JOIN_TABLE__?.store;
                    if (store && store.run) {
                        await store.run();
                    }
                }
                return { success: true, error: null };
            }
            catch (error) {
                return { success: false, error: error.message };
            }
        });

        // データ破損が適切に処理されることを確認
        if (!corruptionResult.success) {
            expect(corruptionResult.error).toBeDefined();
            await expect(page.locator('[data-testid="data-corruption-warning"]')).toBeVisible();
        }
    });

    test("handles permission errors", async ({ page }) => {
        await page.goto("/join-table", { waitUntil: "domcontentloaded" });

        // 読み取り専用モードをシミュレート
        await page.evaluate(() => {
            (window as any).__JOIN_TABLE__ = (window as any).__JOIN_TABLE__ || {};
            (window as any).__JOIN_TABLE__.readOnly = true;
        });

        // wx-svelte-gridの初期化を待つ
        await page.waitForSelector('[data-testid="editable-grid"] .wx-grid', { timeout: 10000 });
        await page.waitForTimeout(2000);

        // 編集操作を試行（wx-svelte-gridの実際のセル構造を使用）
        const editableCell = page.locator('[data-testid="editable-grid"] .wx-cell[role="gridcell"]').first();
        await editableCell.click();

        // 権限エラーメッセージが表示されることを確認
        await expect(page.locator('[data-testid="permission-error-message"]')).toBeVisible();

        // 編集モードにならないことを確認
        await expect(page.locator(".wx-grid-cell-editor")).not.toBeVisible();
    });

    test("handles Fluid Framework connection errors", async ({ page }) => {
        await page.goto("/join-table", { waitUntil: "domcontentloaded" });

        // Fluid接続エラーをシミュレート
        const fluidErrorResult = await page.evaluate(async () => {
            try {
                const fluid = (window as any).__JOIN_TABLE__?.fluid;
                if (fluid && fluid.disconnect) {
                    fluid.disconnect();
                }

                // 接続エラー状態をシミュレート
                (window as any).__JOIN_TABLE__.fluidError = "Connection failed";

                return { success: true, error: null };
            }
            catch (error) {
                return { success: false, error: error.message };
            }
        });

        // Fluid接続エラー表示を確認
        await expect(page.locator('[data-testid="fluid-connection-error"]')).toBeVisible();

        // 再接続ボタンが表示されることを確認
        await expect(page.locator('[data-testid="reconnect-button"]')).toBeVisible();
    });

    test("handles memory overflow gracefully", async ({ page }) => {
        await page.goto("/join-table", { waitUntil: "domcontentloaded" });

        await page.waitForFunction(() => {
            return (window as any).__JOIN_TABLE__ && (window as any).__JOIN_TABLE__.sql;
        }, { timeout: 10000 });

        // メモリ不足をシミュレート（大量データ作成）
        const memoryTestResult = await page.evaluate(async () => {
            try {
                const sql = (window as any).__JOIN_TABLE__?.sql;
                if (!sql) return { success: false, error: "SQL not available" };

                // 非常に大量のデータを作成してメモリ制限をテスト
                for (let i = 0; i < 10000; i++) {
                    const largeString = "x".repeat(1000); // 1KB文字列
                    await sql.exec(`INSERT INTO tbl VALUES('mem_${i}','${largeString}',${i})`);

                    // メモリ使用量をチェック
                    if (performance.memory && performance.memory.usedJSHeapSize > 100 * 1024 * 1024) {
                        // 100MB超過で停止
                        break;
                    }
                }

                return { success: true, error: null };
            }
            catch (error) {
                return { success: false, error: error.message };
            }
        });

        // メモリ不足警告が表示されることを確認（実装に応じて）
        if (!memoryTestResult.success && memoryTestResult.error.includes("memory")) {
            await expect(page.locator('[data-testid="memory-warning"]')).toBeVisible();
        }
    });

    test("handles chart rendering errors", async ({ page }) => {
        await page.goto("/join-table", { waitUntil: "domcontentloaded" });

        await page.waitForFunction(() => {
            return (window as any).__JOIN_TABLE__ && (window as any).__JOIN_TABLE__.sql;
        }, { timeout: 10000 });

        // 不正なチャートデータを作成
        const chartErrorResult = await page.evaluate(async () => {
            try {
                const sql = (window as any).__JOIN_TABLE__?.sql;
                if (sql) {
                    // 不正なデータ型でチャートエラーを誘発
                    await sql.exec("INSERT INTO tbl VALUES('chart_error','invalid_chart_data','not_a_number')");

                    const store = (window as any).__JOIN_TABLE__?.store;
                    if (store && store.run) {
                        await store.run();
                    }
                }
                return { success: true, error: null };
            }
            catch (error) {
                return { success: false, error: error.message };
            }
        });

        // チャートエラーが適切に処理されることを確認
        await page.waitForTimeout(2000);

        // エラー状態でもアプリケーションが動作し続けることを確認
        const appStillWorking = await page.evaluate(() => {
            return (window as any).__JOIN_TABLE__ && (window as any).__JOIN_TABLE__.sql;
        });

        expect(appStillWorking).toBe(true);
    });

    test("handles concurrent edit conflicts", async ({ page, context }) => {
        await page.goto("/join-table", { waitUntil: "domcontentloaded" });

        await page.waitForFunction(() => {
            return (window as any).__JOIN_TABLE__ && (window as any).__JOIN_TABLE__.sql;
        }, { timeout: 10000 });

        const page2 = await context.newPage();
        await page2.goto("/join-table", { waitUntil: "domcontentloaded" });

        await page2.waitForFunction(() => {
            return (window as any).__JOIN_TABLE__ && (window as any).__JOIN_TABLE__.sql;
        }, { timeout: 10000 });

        // 競合するデータを作成
        await page.evaluate(async () => {
            const sql = (window as any).__JOIN_TABLE__?.sql;
            if (sql) {
                await sql.exec("INSERT INTO tbl VALUES('conflict_test','original',100)");
                const store = (window as any).__JOIN_TABLE__?.store;
                if (store && store.run) {
                    await store.run();
                }
            }
        });

        // 両方のページで同期を確認
        await page2.waitForFunction(() => {
            const sql = (window as any).__JOIN_TABLE__?.sql;
            if (!sql) return false;

            return sql.query("SELECT * FROM tbl WHERE id='conflict_test'").then(result => {
                return result.rows.length > 0;
            });
        }, { timeout: 5000 });

        // 同時編集による競合をシミュレート
        const conflictResults = await Promise.allSettled([
            page.evaluate(async () => {
                const sql = (window as any).__JOIN_TABLE__?.sql;
                if (sql) {
                    await sql.exec("UPDATE tbl SET value='user1_edit' WHERE id='conflict_test'");
                    const store = (window as any).__JOIN_TABLE__?.store;
                    if (store && store.run) {
                        await store.run();
                    }
                }
                return "user1_complete";
            }),
            page2.evaluate(async () => {
                const sql = (window as any).__JOIN_TABLE__?.sql;
                if (sql) {
                    await sql.exec("UPDATE tbl SET value='user2_edit' WHERE id='conflict_test'");
                    const store = (window as any).__JOIN_TABLE__?.store;
                    if (store && store.run) {
                        await store.run();
                    }
                }
                return "user2_complete";
            }),
        ]);

        // 競合が適切に解決されることを確認
        expect(conflictResults[0].status).toBe("fulfilled");
        expect(conflictResults[1].status).toBe("fulfilled");

        // 競合解決後の最終状態を確認
        await page.waitForTimeout(2000);

        const finalValue = await page.evaluate(async () => {
            const sql = (window as any).__JOIN_TABLE__?.sql;
            const result = await sql.query("SELECT * FROM tbl WHERE id='conflict_test'");
            return result.rows[0];
        });

        expect(finalValue).toBeDefined();
        expect(["user1_edit", "user2_edit"]).toContain(finalValue.value);
    });

    test("handles browser compatibility issues", async ({ page }) => {
        await page.goto("/join-table", { waitUntil: "domcontentloaded" });

        // ブラウザ互換性チェック
        const compatibilityResult = await page.evaluate(() => {
            const features = {
                webAssembly: typeof WebAssembly !== "undefined",
                indexedDB: typeof indexedDB !== "undefined",
                webWorkers: typeof Worker !== "undefined",
                localStorage: typeof localStorage !== "undefined",
                fetch: typeof fetch !== "undefined",
            };

            const unsupportedFeatures = Object.entries(features)
                .filter(([feature, supported]) => !supported)
                .map(([feature]) => feature);

            return {
                features,
                unsupportedFeatures,
                isCompatible: unsupportedFeatures.length === 0,
            };
        });

        expect(compatibilityResult.features.webAssembly).toBe(true);
        expect(compatibilityResult.features.indexedDB).toBe(true);
        expect(compatibilityResult.features.webWorkers).toBe(true);

        if (!compatibilityResult.isCompatible) {
            // 非対応ブラウザでの警告表示を確認
            await expect(page.locator('[data-testid="browser-compatibility-warning"]')).toBeVisible();
        }
    });

    test("handles graceful degradation", async ({ page }) => {
        await page.goto("/join-table", { waitUntil: "domcontentloaded" });

        // 機能の段階的劣化をテスト
        const degradationResult = await page.evaluate(async () => {
            try {
                // WebAssemblyが利用できない場合のフォールバック
                if (window.WebAssembly) {
                    delete window.WebAssembly;
                }

                // 基本機能が動作することを確認
                const sql = (window as any).__JOIN_TABLE__?.sql;
                if (sql) {
                    await sql.query("SELECT 1 as test");
                }

                return { success: true, error: null };
            }
            catch (error) {
                return { success: false, error: error.message };
            }
        });

        // 段階的劣化が適切に処理されることを確認
        if (!degradationResult.success) {
            await expect(page.locator('[data-testid="feature-degradation-notice"]')).toBeVisible();
        }
    });
});
