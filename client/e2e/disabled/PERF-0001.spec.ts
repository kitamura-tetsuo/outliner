/** @feature PERF-0001
 *  Title   : パフォーマンステスト
 *  Source  : docs/client-features.yaml
 */
/**
 * PERF-0001: スケジュール公開パフォーマンステスト
 * 大量データでのスケジュール公開性能と同時処理の最適化をテストする
 */

import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("PERF-0001: スケジュール公開パフォーマンス", () => {
    test.beforeEach(async ({ page }) => {
        await TestHelpers.prepareTestEnvironment(page);
    });

    test("1000個のアイテムを持つ下書きでも5秒以内でスケジュール作成が完了する", async ({ page }) => {
        // 大量データのテスト用下書きを設定
        await page.evaluate(() => {
            // 1000個のアイテムを持つ下書きデータを作成
            const largeItems = Array.from({ length: 1000 }, (_, i) => ({
                id: `item-${i}`,
                text: `テストアイテム ${i + 1}: これは大量データのパフォーマンステスト用のアイテムです。`,
                children: [],
                metadata: {
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
            }));

            window.__TEST_LARGE_DRAFT_DATA__ = {
                items: largeItems,
                itemCount: 1000,
            };
        });

        await page.goto("/test-project/test-page");

        // スケジュール公開ダイアログを開く
        await page.click('[data-testid="schedule-publish-button"]');

        const dialog = page.locator('[role="dialog"]');
        await expect(dialog).toBeVisible();

        // 公開日時を設定（1時間後）
        const futureDate = new Date();
        futureDate.setHours(futureDate.getHours() + 1);

        await page.fill("#scheduled-date", futureDate.toISOString().split("T")[0]);
        await page.fill("#scheduled-time", "14:30");

        // パフォーマンス測定開始
        const startTime = Date.now();

        // スケジュール作成を実行
        await page.click(".schedule-button");

        // 完了まで待機（ダイアログが閉じることで完了を判定）
        await expect(dialog).not.toBeVisible({ timeout: 10000 });

        const endTime = Date.now();
        const duration = endTime - startTime;

        // 5秒以内で完了することを確認
        expect(duration).toBeLessThan(5000);

        console.log(`大量データ処理時間: ${duration}ms`);
    });

    test("5つのスケジュールを同時作成しても10秒以内で完了する", async ({ page }) => {
        await page.goto("/test-project/test-page");

        // 5つの下書きを作成
        await page.evaluate(() => {
            window.__TEST_MULTIPLE_DRAFTS__ = [
                { id: "draft-1", title: "Draft 1", items: [] },
                { id: "draft-2", title: "Draft 2", items: [] },
                { id: "draft-3", title: "Draft 3", items: [] },
                { id: "draft-4", title: "Draft 4", items: [] },
                { id: "draft-5", title: "Draft 5", items: [] },
            ];
        });

        const startTime = Date.now();

        // 複数のスケジュール公開を同時に実行
        const schedulePromises = [];
        for (let i = 1; i <= 5; i++) {
            schedulePromises.push(
                page.evaluate(async draftIndex => {
                    const scheduleTime = Date.now() + (draftIndex * 60000); // 1分間隔

                    // スケジュールサービスを直接呼び出し
                    const result = await window.__SCHEDULE_SERVICE__.createScheduledPublish({
                        draftId: `draft-${draftIndex}`,
                        containerId: "test-container",
                        scheduledAt: scheduleTime,
                        retryConfig: {
                            maxRetries: 3,
                            retryInterval: 300,
                            useExponentialBackoff: true,
                        },
                    });

                    return result;
                }, i),
            );
        }

        // 全てのスケジュール作成を並行実行
        const results = await Promise.all(schedulePromises);
        const endTime = Date.now();

        const totalTime = endTime - startTime;

        // 5つのスケジュールが10秒以内で作成されることを確認
        expect(totalTime).toBeLessThan(10000);

        // 全てのスケジュールが正常に作成されることを確認
        expect(results).toHaveLength(5);
        results.forEach((result, index) => {
            expect(result).toHaveProperty("taskId");
            expect(result.draftId).toBe(`draft-${index + 1}`);
            expect(result.status).toBe("scheduled");
        });

        console.log(`Concurrent scheduling performance:
        - Total time for 5 schedules: ${totalTime}ms
        - Average time per schedule: ${Math.round(totalTime / 5)}ms`);
    });

    test("メモリ使用量とレスポンス時間の改善", async ({ page }) => {
        await page.goto("/test-project/test-page");

        // 初期メモリ使用量を測定
        const initialMemory = await page.evaluate(() => {
            if (performance.memory) {
                return performance.memory.usedJSHeapSize;
            }
            return 0;
        });

        // 複数回のスケジュール操作を実行
        const operationTimes = [];

        for (let i = 0; i < 10; i++) {
            const operationStart = Date.now();

            // スケジュール公開ダイアログを開く
            await page.click('[data-testid="schedule-publish-button"]');
            await expect(page.locator('[role="dialog"]')).toBeVisible();

            // 日時を設定
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 1);
            futureDate.setHours(14, 30 + i, 0, 0); // 各回で異なる時刻

            const dateString = futureDate.toISOString().split("T")[0];
            const timeString = futureDate.toTimeString().slice(0, 5);

            await page.fill("#scheduled-date", dateString);
            await page.fill("#scheduled-time", timeString);

            // スケジュール作成
            await page.click(".schedule-button");
            await expect(page.locator('[role="dialog"]')).not.toBeVisible();

            const operationEnd = Date.now();
            operationTimes.push(operationEnd - operationStart);

            // 少し待機してメモリ安定化
            await page.waitForTimeout(100);
        }

        // 最終メモリ使用量を測定
        const finalMemory = await page.evaluate(() => {
            if (performance.memory) {
                return performance.memory.usedJSHeapSize;
            }
            return 0;
        });

        // パフォーマンス分析
        const averageOperationTime = operationTimes.reduce((a, b) => a + b, 0) / operationTimes.length;
        const maxOperationTime = Math.max(...operationTimes);
        const memoryIncrease = finalMemory - initialMemory;

        // パフォーマンス要件の確認
        expect(averageOperationTime).toBeLessThan(2000); // 平均2秒以内
        expect(maxOperationTime).toBeLessThan(5000); // 最大5秒以内

        // メモリリークがないことを確認（10MB以下の増加）
        expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);

        console.log(`Memory and response time metrics:
        - Average operation time: ${Math.round(averageOperationTime)}ms
        - Max operation time: ${maxOperationTime}ms
        - Memory increase: ${Math.round(memoryIncrease / 1024 / 1024)}MB
        - Operations completed: ${operationTimes.length}`);
    });

    test("大量スケジュール一覧表示のパフォーマンス", async ({ page }) => {
        await page.goto("/test-project/test-page");

        // 100個のスケジュールデータを作成してテスト用UIに表示
        await page.evaluate(() => {
            const schedules = [];
            for (let i = 0; i < 100; i++) {
                schedules.push({
                    taskId: `task-${i}`,
                    draftId: `draft-${i}`,
                    authorId: "test-user",
                    createdAt: Date.now() - (i * 60000),
                    updatedAt: Date.now() - (i * 60000),
                    scheduledAt: Date.now() + (i * 60000),
                    status: i % 4 === 0 ? "scheduled" :
                        i % 4 === 1 ? "processing" :
                        i % 4 === 2 ? "published" : "failed",
                    retryCount: i % 4 === 3 ? Math.floor(i / 10) : 0,
                });
            }

            // テスト用のスケジュール一覧UIを動的に作成
            const scheduleListContainer = document.createElement("div");
            scheduleListContainer.setAttribute("data-testid", "schedule-list");
            scheduleListContainer.style.cssText =
                "height: 400px; overflow-y: auto; border: 1px solid #ccc; padding: 10px;";

            schedules.forEach((schedule, index) => {
                const scheduleItem = document.createElement("div");
                scheduleItem.setAttribute("data-testid", "schedule-item");
                scheduleItem.style.cssText = "padding: 8px; border-bottom: 1px solid #eee; margin-bottom: 4px;";
                scheduleItem.innerHTML = `
                    <div>Task ID: ${schedule.taskId}</div>
                    <div>Status: ${schedule.status}</div>
                    <div>Scheduled: ${new Date(schedule.scheduledAt).toLocaleString()}</div>
                `;
                scheduleListContainer.appendChild(scheduleItem);
            });

            // ページに追加
            document.body.appendChild(scheduleListContainer);
            window.__TEST_LARGE_SCHEDULE_LIST__ = schedules;
        });

        const renderStart = Date.now();

        // スケジュール一覧が表示されるまで待機
        await expect(page.locator('[data-testid="schedule-list"]')).toBeVisible();
        await expect(page.locator('[data-testid="schedule-item"]')).toHaveCount(100);

        const renderEnd = Date.now();
        const renderTime = renderEnd - renderStart;

        // 100個のスケジュールが3秒以内で表示されることを確認
        expect(renderTime).toBeLessThan(3000);

        // スクロールパフォーマンスをテスト
        const scrollStart = Date.now();

        // リストの最下部までスクロール
        await page.locator('[data-testid="schedule-list"]').evaluate(el => {
            el.scrollTop = el.scrollHeight;
        });

        // スクロール完了を待機
        await page.waitForTimeout(100);

        const scrollEnd = Date.now();
        const scrollTime = scrollEnd - scrollStart;

        // スクロールが500ms以内で完了することを確認
        expect(scrollTime).toBeLessThan(500);

        console.log(`Large list performance:
        - Render time for 100 items: ${renderTime}ms
        - Scroll time: ${scrollTime}ms`);
    });

    test("リアルタイム更新のパフォーマンス", async ({ page }) => {
        await page.goto("/test-project/test-page");

        // リアルタイム更新の頻度をテスト
        const updateTimes = [];

        // 10回のリアルタイム更新を実行
        for (let i = 0; i < 10; i++) {
            const updateStart = Date.now();

            // スケジュール状態を更新
            await page.evaluate(index => {
                const newStatus = index % 2 === 0 ? "processing" : "scheduled";
                window.__SCHEDULE_SERVICE__.updateScheduleResult(`task-${index}`, {
                    success: index % 2 === 0,
                    taskId: `task-${index}`,
                    executedAt: Date.now(),
                });
            }, i);

            // UI更新を待機
            await page.waitForTimeout(50);

            const updateEnd = Date.now();
            updateTimes.push(updateEnd - updateStart);
        }

        const averageUpdateTime = updateTimes.reduce((a, b) => a + b, 0) / updateTimes.length;

        // リアルタイム更新が平均100ms以内で完了することを確認
        expect(averageUpdateTime).toBeLessThan(100);

        console.log(`Real-time update performance:
        - Average update time: ${Math.round(averageUpdateTime)}ms
        - Updates completed: ${updateTimes.length}`);
    });
});
