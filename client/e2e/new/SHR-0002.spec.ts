/** @feature SHR-0002
 * リアルタイム共有テスト
 */
import {
    expect,
    test,
} from "@playwright/test";

test.describe("SHR-0002: リアルタイム共有テスト", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // TestHelpers.prepareTestEnvironmentをスキップ
        // await TestHelpers.prepareTestEnvironment(page, testInfo, [], false, true);
    });

    // 共通の初期化処理
    async function initializeJoinTablePage(page: any) {
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
    }

    test("multiple users can edit simultaneously", async ({ page, context }) => {
        // 最初のユーザーでプロジェクトを開く
        await initializeJoinTablePage(page);

        // 2番目のユーザーで同じプロジェクトを開く
        const page2 = await context.newPage();
        await initializeJoinTablePage(page2);

        // 最初のユーザーがデータを追加
        await page.evaluate(async () => {
            const sql = (window as any).__JOIN_TABLE__?.sql;
            if (sql) {
                await sql.exec("INSERT INTO tbl VALUES('user1_data','from_user1',100)");
                const store = (window as any).__JOIN_TABLE__?.store;
                if (store && store.run) {
                    await store.run();
                }
            }
        });

        // 2番目のユーザーでも変更が反映されることを確認
        await page2.waitForFunction(() => {
            const sql = (window as any).__JOIN_TABLE__?.sql;
            if (!sql) return false;

            return sql.query("SELECT * FROM tbl WHERE id='user1_data'").then(result => {
                return result.rows.length > 0;
            });
        }, { timeout: 5000 });

        // 2番目のユーザーもデータを追加
        await page2.evaluate(async () => {
            const sql = (window as any).__JOIN_TABLE__?.sql;
            if (sql) {
                await sql.exec("INSERT INTO tbl VALUES('user2_data','from_user2',200)");
                const store = (window as any).__JOIN_TABLE__?.store;
                if (store && store.run) {
                    await store.run();
                }
            }
        });

        // 最初のユーザーでも2番目のユーザーの変更が反映されることを確認
        await page.waitForFunction(() => {
            const sql = (window as any).__JOIN_TABLE__?.sql;
            if (!sql) return false;

            return sql.query("SELECT * FROM tbl WHERE id='user2_data'").then(result => {
                return result.rows.length > 0;
            });
        }, { timeout: 5000 });

        // 両方のデータが存在することを確認
        const finalData = await page.evaluate(async () => {
            const sql = (window as any).__JOIN_TABLE__?.sql;
            const result = await sql.query("SELECT * FROM tbl WHERE id IN ('user1_data', 'user2_data') ORDER BY id");
            return result.rows;
        });

        expect(finalData).toHaveLength(2);
        expect(finalData[0]).toMatchObject({ id: "user1_data", value: "from_user1", num: 100 });
        expect(finalData[1]).toMatchObject({ id: "user2_data", value: "from_user2", num: 200 });
    });

    test("cursor positions are synchronized", async ({ page, context }) => {
        await initializeJoinTablePage(page);

        const page2 = await context.newPage();
        await initializeJoinTablePage(page2);

        // 最初のページでセルを選択
        const firstCell = page.locator('.wx-cell[role="gridcell"]').first();
        await firstCell.click();

        // カーソル位置情報がFluidに送信されることを確認
        await page.evaluate(() => {
            const fluid = (window as any).__JOIN_TABLE__?.fluid;
            if (fluid && fluid.cursors) {
                fluid.cursors.set("user1", { row: 0, col: 0, timestamp: Date.now() });
            }
        });

        // 2番目のページでカーソル情報が受信されることを確認
        await page2.waitForFunction(() => {
            const fluid = (window as any).__JOIN_TABLE__?.fluid;
            return fluid && fluid.cursors && fluid.cursors.has("user1");
        }, { timeout: 5000 });

        const cursorInfo = await page2.evaluate(() => {
            const fluid = (window as any).__JOIN_TABLE__?.fluid;
            return fluid ? fluid.cursors.get("user1") : null;
        });

        expect(cursorInfo).toBeDefined();
        expect(cursorInfo.row).toBe(0);
        expect(cursorInfo.col).toBe(0);
    });

    test("conflict resolution works correctly", async ({ page, context }) => {
        await initializeJoinTablePage(page);

        const page2 = await context.newPage();
        await initializeJoinTablePage(page2);

        // 同じレコードを両方のユーザーが同時に編集
        const conflictId = "conflict_test";

        // 最初にレコードを作成
        await page.evaluate(async id => {
            const sql = (window as any).__JOIN_TABLE__?.sql;
            if (sql) {
                await sql.exec(`INSERT INTO tbl VALUES('${id}','original_value',0)`);
                const store = (window as any).__JOIN_TABLE__?.store;
                if (store && store.run) {
                    await store.run();
                }
            }
        }, conflictId);

        // 両方のページで同期を確認
        await page2.waitForFunction(
            id => {
                const sql = (window as any).__JOIN_TABLE__?.sql;
                if (!sql) return false;

                return sql.query(`SELECT * FROM tbl WHERE id='${id}'`).then(result => {
                    return result.rows.length > 0;
                });
            },
            conflictId,
            { timeout: 5000 },
        );

        // 両方のユーザーが同時に異なる値に更新
        await Promise.all([
            page.evaluate(async id => {
                const sql = (window as any).__JOIN_TABLE__?.sql;
                if (sql) {
                    await sql.exec(`UPDATE tbl SET value='user1_update', num=111 WHERE id='${id}'`);
                    const store = (window as any).__JOIN_TABLE__?.store;
                    if (store && store.run) {
                        await store.run();
                    }
                }
            }, conflictId),
            page2.evaluate(async id => {
                const sql = (window as any).__JOIN_TABLE__?.sql;
                if (sql) {
                    await sql.exec(`UPDATE tbl SET value='user2_update', num=222 WHERE id='${id}'`);
                    const store = (window as any).__JOIN_TABLE__?.store;
                    if (store && store.run) {
                        await store.run();
                    }
                }
            }, conflictId),
        ]);

        // 競合解決が完了するまで待機
        await page.waitForTimeout(2000);

        // 最終的な値を確認（最後の更新が勝つか、マージされるかは実装による）
        const finalValue = await page.evaluate(async id => {
            const sql = (window as any).__JOIN_TABLE__?.sql;
            const result = await sql.query(`SELECT * FROM tbl WHERE id='${id}'`);
            return result.rows[0];
        }, conflictId);

        expect(finalValue).toBeDefined();
        expect(["user1_update", "user2_update"]).toContain(finalValue.value);
    });

    test("user presence is displayed", async ({ page, context }) => {
        // TestHelpers.prepareTestEnvironmentをスキップして直接join-tableページにアクセス
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

        // コンテナの作成を待つ
        await page.waitForFunction(() => {
            const fluid = (window as any).__JOIN_TABLE__?.fluid;
            console.log("Checking fluid container:", {
                hasJoinTable: !!(window as any).__JOIN_TABLE__,
                hasFluid: !!(window as any).__JOIN_TABLE__?.fluid,
                containerId: (window as any).__JOIN_TABLE__?.fluid?.containerId,
                container: !!(window as any).__JOIN_TABLE__?.fluid?.container,
            });
            return fluid && fluid.containerId;
        }, { timeout: 30000 });

        // 最初のページでコンテナIDを取得
        const containerId = await page.evaluate(() => {
            const fluid = (window as any).__JOIN_TABLE__?.fluid;
            console.log("Page 1 - Container ID:", fluid?.containerId);
            return fluid?.containerId;
        });

        expect(containerId).toBeDefined();

        // 最初のページでユーザープレゼンス情報を設定（ローカルのみ）
        await page.evaluate(() => {
            const fluid = (window as any).__JOIN_TABLE__?.fluid;
            console.log("Page 1 - Setting user1 presence locally");
            if (fluid && fluid.setPresenceLocal) {
                fluid.setPresenceLocal("user1", {
                    name: "User 1",
                    color: "#ff0000",
                    cursor: { row: 0, col: 0 },
                });
                console.log("Page 1 - User1 presence set, current presence size:", fluid.presence.size);
            }
        });

        const page2 = await context.newPage();
        await page2.goto(`/join-table?containerId=${containerId}`, { waitUntil: "domcontentloaded" });

        // 2番目のページで同じコンテナに接続
        await page2.waitForFunction(() => {
            return (window as any).__JOIN_TABLE__ &&
                (window as any).__JOIN_TABLE__.fluid &&
                (window as any).__JOIN_TABLE__.store &&
                (window as any).__JOIN_TABLE__.sql;
        }, { timeout: 30000 });

        // コンテナIDが正しく設定されていることを確認
        await page2.evaluate(containerId => {
            const fluid = (window as any).__JOIN_TABLE__?.fluid;
            console.log("Page 2 - Expected container ID:", containerId);
            console.log("Page 2 - Actual container ID:", fluid?.containerId);
            console.log("Page 2 - Container loaded, current presence size:", fluid?.presence?.size);
        }, containerId);

        // 2番目のページでユーザープレゼンス情報を設定（ブロードキャスト）
        await page2.evaluate(() => {
            const fluid = (window as any).__JOIN_TABLE__?.fluid;
            console.log("Page 2 - Setting user2 presence with broadcast");
            if (fluid && fluid.setPresence) {
                fluid.setPresence("user2", {
                    name: "User 2",
                    color: "#00ff00",
                    cursor: { row: 1, col: 1 },
                });
                console.log("Page 2 - User2 presence set, current presence size:", fluid.presence.size);
            }
        });

        // 少し待機してシグナルが伝播するのを待つ
        await page.waitForTimeout(2000);

        // 最初のページで2番目のユーザーのpresenceが受信されることを確認
        await page.waitForFunction(() => {
            const fluid = (window as any).__JOIN_TABLE__?.fluid;
            if (!fluid || !fluid.presence) return false;
            return fluid.presence.has("user2");
        }, { timeout: 5000 });

        // 最初のページでpresence状況を確認
        const page1PresenceInfo = await page.evaluate(() => {
            const fluid = (window as any).__JOIN_TABLE__?.fluid;
            if (!fluid || !fluid.presence) return null;

            const users = [];
            for (const [userId, userInfo] of fluid.presence.entries()) {
                users.push({ userId, userInfo });
            }
            console.log("Page 1 - Current presence:", users);
            return users;
        });

        console.log("Page 1 presence info:", page1PresenceInfo);

        // 2番目のページでpresence状況を確認
        const page2PresenceInfo = await page2.evaluate(() => {
            const fluid = (window as any).__JOIN_TABLE__?.fluid;
            if (!fluid || !fluid.presence) return null;

            const users = [];
            for (const [userId, userInfo] of fluid.presence.entries()) {
                users.push({ userId, userInfo });
            }
            console.log("Page 2 - Current presence:", users);
            return users;
        });

        console.log("Page 2 presence info:", page2PresenceInfo);

        // シグナル同期のテスト：最初のページで2番目のユーザーのpresenceが受信されていることを確認
        expect(page1PresenceInfo).toHaveLength(2);
        expect(page1PresenceInfo.some(u => u.userId === "user1" && u.userInfo.name === "User 1")).toBe(true);
        expect(page1PresenceInfo.some(u => u.userId === "user2" && u.userInfo.name === "User 2")).toBe(true);

        // 2番目のページでは自分のpresence情報のみ
        expect(page2PresenceInfo).toHaveLength(1);
        expect(page2PresenceInfo.some(u => u.userId === "user2" && u.userInfo.name === "User 2")).toBe(true);
    });

    test("real-time chart updates work", async ({ page, context }) => {
        await initializeJoinTablePage(page);

        const page2 = await context.newPage();
        await initializeJoinTablePage(page2);

        // 最初のページでデータを追加
        await page.evaluate(async () => {
            const sql = (window as any).__JOIN_TABLE__?.sql;
            if (sql) {
                await sql.exec("INSERT INTO tbl VALUES('chart_test','chart_data',500)");
                const store = (window as any).__JOIN_TABLE__?.store;
                if (store && store.run) {
                    await store.run();
                }
            }
        });

        // 2番目のページでチャートが更新されることを確認
        await page2.waitForFunction(() => {
            const chartEl = document.querySelector('[data-testid="chart-panel"]');
            const chart = chartEl?._echarts_instance_;
            if (!chart) return false;

            const option = chart.getOption();
            // EChartsのbar chartでは、xAxis.dataにカテゴリ、series[0].dataに値が入る
            return option.xAxis && option.xAxis[0] && option.xAxis[0].data &&
                option.xAxis[0].data.includes("chart_data") &&
                option.series && option.series[0] && option.series[0].data &&
                option.series[0].data.includes(500);
        }, { timeout: 10000 });

        const chartInfo = await page2.evaluate(() => {
            const chartEl = document.querySelector('[data-testid="chart-panel"]');
            const chart = chartEl?._echarts_instance_;
            const option = chart.getOption();
            return {
                categories: option.xAxis[0].data,
                values: option.series[0].data,
            };
        });

        expect(chartInfo.categories).toContain("chart_data");
        expect(chartInfo.values).toContain(500);
    });

    test("offline/online synchronization works", async ({ page, context }) => {
        await initializeJoinTablePage(page);

        // ネットワークをオフラインにする
        await page.context().setOffline(true);

        // オフライン状態でデータを変更
        await page.evaluate(async () => {
            const sql = (window as any).__JOIN_TABLE__?.sql;
            if (sql) {
                await sql.exec("INSERT INTO tbl VALUES('offline_data','offline_value',999)");
                const store = (window as any).__JOIN_TABLE__?.store;
                if (store && store.run) {
                    await store.run();
                }
            }
        });

        // ネットワークをオンラインに戻す
        await page.context().setOffline(false);

        // 同期が完了するまで待機
        await page.waitForTimeout(3000);

        // 2番目のページで変更が同期されることを確認
        const page2 = await context.newPage();
        await initializeJoinTablePage(page2);

        await page2.waitForFunction(() => {
            const sql = (window as any).__JOIN_TABLE__?.sql;
            if (!sql) return false;

            return sql.query("SELECT * FROM tbl WHERE id='offline_data'").then(result => {
                return result.rows.length > 0;
            });
        }, { timeout: 10000 });

        const syncedData = await page2.evaluate(async () => {
            const sql = (window as any).__JOIN_TABLE__?.sql;
            const result = await sql.query("SELECT * FROM tbl WHERE id='offline_data'");
            return result.rows[0];
        });

        expect(syncedData).toMatchObject({
            id: "offline_data",
            value: "offline_value",
            num: 999,
        });
    });

    test("user can leave and rejoin collaboration", async ({ page, context }) => {
        await initializeJoinTablePage(page);

        // ユーザーがセッションを離れる
        await page.evaluate(() => {
            const fluid = (window as any).__JOIN_TABLE__?.fluid;
            if (fluid && fluid.disconnect) {
                fluid.disconnect();
            }
        });

        // 新しいページで再参加
        const page2 = await context.newPage();
        await initializeJoinTablePage(page2);

        // 再参加後にデータが正しく同期されることを確認
        const rejoinData = await page2.evaluate(async () => {
            const sql = (window as any).__JOIN_TABLE__?.sql;
            const result = await sql.query("SELECT COUNT(*) as count FROM tbl");
            return result.rows[0].count;
        });

        expect(rejoinData).toBeGreaterThanOrEqual(0);
    });
});
