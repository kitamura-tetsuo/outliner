/** @feature DFT-0004 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import { TreeValidator } from "../utils/treeValidation";

test.describe("DFT-0004: スケジュール公開機能", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("下書き作成時にスケジュール公開時刻を設定できる", async ({ page }) => {
        // プロジェクトとページは既にbeforeEachで作成済み

        // 初期データを追加
        await page.locator(".outliner-item").first().click();
        await page.keyboard.press("End");
        await page.keyboard.type("スケジュールテスト用データ");
        await page.waitForTimeout(500);

        // 下書きを作成
        const draftId = await page.evaluate(async () => {
            try {
                const fluidStore = (window as any).__FLUID_STORE__;
                const fluidClient = fluidStore.fluidClient;

                const { draftService } = await import("/src/lib/draftService.svelte.ts");
                const draft = await draftService.createDraft(fluidClient, {
                    title: "スケジュールテスト下書き",
                });
                return draft.metadata.id;
            }
            catch (error) {
                throw new Error(`Draft creation failed: ${error.message}`);
            }
        });

        // スケジュール公開を設定（1時間後）
        const scheduledAt = Date.now() + 3600000; // 1時間後
        const scheduleResult = await page.evaluate(async ({ draftId, scheduledAt }) => {
            try {
                const { draftService } = await import("/src/lib/draftService.svelte.ts");
                return await draftService.createScheduledPublish(draftId, scheduledAt);
            }
            catch (error) {
                return {
                    success: false,
                    error: error.message,
                };
            }
        }, { draftId, scheduledAt });

        console.log("Schedule result:", scheduleResult);

        // スケジュール作成の検証
        expect(scheduleResult.taskId).toBeDefined();
        expect(scheduleResult.draftId).toBe(draftId);
        expect(scheduleResult.scheduledAt).toBe(scheduledAt);
        expect(scheduleResult.status).toBe("scheduled");

        console.log(`スケジュール公開が設定されました。タスクID: ${scheduleResult.taskId}`);
        console.log(`公開予定時刻: ${new Date(scheduledAt).toISOString()}`);
    });

    test("スケジュール公開の状態を追跡できる", async ({ page }) => {
        // プロジェクトとページは既にbeforeEachで作成済み

        // 下書きを作成
        const draftId = await page.evaluate(async () => {
            try {
                const fluidStore = (window as any).__FLUID_STORE__;
                const fluidClient = fluidStore.fluidClient;

                const { draftService } = await import("/src/lib/draftService.svelte.ts");
                const draft = await draftService.createDraft(fluidClient, {
                    title: "状態追跡テスト下書き",
                });
                return draft.metadata.id;
            }
            catch (error) {
                throw new Error(`Draft creation failed: ${error.message}`);
            }
        });

        // スケジュール公開を設定
        const scheduledAt = Date.now() + 1800000; // 30分後
        await page.evaluate(async ({ draftId, scheduledAt }) => {
            const { draftService } = await import("/src/lib/draftService.svelte.ts");
            return await draftService.createScheduledPublish(draftId, scheduledAt);
        }, { draftId, scheduledAt });

        // スケジュール状態を取得
        const scheduleStatus = await page.evaluate(async (draftId) => {
            const { draftService } = await import("/src/lib/draftService.svelte.ts");
            return await draftService.getScheduleStatus(draftId);
        }, draftId);

        console.log("Schedule status:", scheduleStatus);

        // 状態の検証
        expect(scheduleStatus).toBeDefined();
        expect(scheduleStatus.draftId).toBe(draftId);
        expect(scheduleStatus.status).toBe("scheduled");
        expect(scheduleStatus.scheduledAt).toBe(scheduledAt);
        expect(scheduleStatus.taskId).toBeDefined();

        console.log(`スケジュール状態が正常に取得できました。状態: ${scheduleStatus.status}`);
    });

    test("スケジュールのキャンセル・変更ができる", async ({ page }) => {
        // プロジェクトとページは既にbeforeEachで作成済み

        // 下書きを作成
        const draftId = await page.evaluate(async () => {
            try {
                const fluidStore = (window as any).__FLUID_STORE__;
                const fluidClient = fluidStore.fluidClient;

                const { draftService } = await import("/src/lib/draftService.svelte.ts");
                const draft = await draftService.createDraft(fluidClient, {
                    title: "キャンセルテスト下書き",
                });
                return draft.metadata.id;
            }
            catch (error) {
                throw new Error(`Draft creation failed: ${error.message}`);
            }
        });

        // スケジュール公開を設定
        const scheduledAt = Date.now() + 7200000; // 2時間後
        await page.evaluate(async ({ draftId, scheduledAt }) => {
            const { draftService } = await import("/src/lib/draftService.svelte.ts");
            return await draftService.createScheduledPublish(draftId, scheduledAt);
        }, { draftId, scheduledAt });

        // スケジュールをキャンセル
        const cancelResult = await page.evaluate(async (draftId) => {
            try {
                const { draftService } = await import("/src/lib/draftService.svelte.ts");
                return await draftService.cancelScheduledPublish(draftId);
            }
            catch (error) {
                return {
                    success: false,
                    error: error.message,
                };
            }
        }, draftId);

        console.log("Cancel result:", cancelResult);

        // キャンセル結果の検証
        expect(cancelResult).toBe(true);

        // キャンセル後の状態を確認
        const statusAfterCancel = await page.evaluate(async (draftId) => {
            const { draftService } = await import("/src/lib/draftService.svelte.ts");
            return await draftService.getScheduleStatus(draftId);
        }, draftId);

        console.log("Status after cancel:", statusAfterCancel);

        // キャンセル後の状態検証
        if (statusAfterCancel) {
            expect(statusAfterCancel.status).toBe("cancelled");
        }

        console.log("スケジュールが正常にキャンセルされました");
    });

    test("Cloud Tasksでスケジュールタスクを作成できる", async ({ page }) => {
        // プロジェクトとページは既にbeforeEachで作成済み

        // 下書きを作成
        const draftId = await page.evaluate(async () => {
            try {
                const fluidStore = (window as any).__FLUID_STORE__;
                const fluidClient = fluidStore.fluidClient;

                const { draftService } = await import("/src/lib/draftService.svelte.ts");
                const draft = await draftService.createDraft(fluidClient, {
                    title: "Cloud Tasksテスト下書き",
                });
                return draft.metadata.id;
            }
            catch (error) {
                throw new Error(`Draft creation failed: ${error.message}`);
            }
        });

        // スケジュール公開を設定（テスト環境ではモックタスクが作成される）
        const scheduledAt = Date.now() + 900000; // 15分後
        const scheduleResult = await page.evaluate(async ({ draftId, scheduledAt }) => {
            try {
                const { draftService } = await import("/src/lib/draftService.svelte.ts");
                return await draftService.createScheduledPublish(draftId, scheduledAt);
            }
            catch (error) {
                return {
                    success: false,
                    error: error.message,
                };
            }
        }, { draftId, scheduledAt });

        console.log("Cloud Tasks schedule result:", scheduleResult);

        // Cloud Tasksタスクの検証
        expect(scheduleResult.taskId).toBeDefined();
        expect(scheduleResult.cloudTaskId).toBeDefined();
        expect(scheduleResult.cloudTaskId).toMatch(/^test-task-/); // テスト環境のモックタスクID

        console.log(`Cloud Tasksタスクが作成されました。タスクID: ${scheduleResult.cloudTaskId}`);
    });

    test("スケジュール公開機能の統合テスト", async ({ page }) => {
        // プロジェクトとページは既にbeforeEachで作成済み

        // 初期データを追加
        await page.locator(".outliner-item").first().click();
        await page.keyboard.press("End");
        await page.keyboard.type("統合テスト用データ");
        await page.waitForTimeout(500);

        // 下書きを作成
        const draftId = await page.evaluate(async () => {
            try {
                const fluidStore = (window as any).__FLUID_STORE__;
                const fluidClient = fluidStore.fluidClient;

                const { draftService } = await import("/src/lib/draftService.svelte.ts");
                const draft = await draftService.createDraft(fluidClient, {
                    title: "統合テスト下書き",
                });
                return draft.metadata.id;
            }
            catch (error) {
                throw new Error(`Draft creation failed: ${error.message}`);
            }
        });

        // 下書きにデータを追加
        await page.evaluate(async (draftId) => {
            const { draftService } = await import("/src/lib/draftService.svelte.ts");
            
            const testItem = {
                id: "schedule-test-item-" + Date.now(),
                text: "スケジュール公開テスト用アイテム",
                author: "test-user",
                votes: [],
                created: Date.now(),
                lastChanged: Date.now(),
                items: [],
            };

            draftService.addItemToDraft(draftId, testItem);
        }, draftId);

        // スケジュール公開を設定
        const scheduledAt = Date.now() + 600000; // 10分後
        const scheduleResult = await page.evaluate(async ({ draftId, scheduledAt }) => {
            const { draftService } = await import("/src/lib/draftService.svelte.ts");
            return await draftService.createScheduledPublish(draftId, scheduledAt, {
                retryConfig: {
                    maxRetries: 3,
                    retryInterval: 60,
                    useExponentialBackoff: true,
                },
                notificationConfig: {
                    notifyOnSuccess: true,
                    notifyOnFailure: true,
                    emailAddress: "test@example.com",
                },
            });
        }, { draftId, scheduledAt });

        // 統合テストの検証
        expect(scheduleResult.taskId).toBeDefined();
        expect(scheduleResult.draftId).toBe(draftId);
        expect(scheduleResult.scheduledAt).toBe(scheduledAt);
        expect(scheduleResult.status).toBe("scheduled");
        expect(scheduleResult.cloudTaskId).toBeDefined();

        // 下書きデータの確認
        const draftData = await page.evaluate(async (draftId) => {
            const { draftService } = await import("/src/lib/draftService.svelte.ts");
            return draftService.getDraftAsJson(draftId);
        }, draftId);

        expect(draftData).toBeDefined();
        expect(draftData.title).toBe("統合テスト下書き");

        console.log("スケジュール公開機能の統合テストが成功しました");
        console.log(`タスクID: ${scheduleResult.taskId}`);
        console.log(`公開予定時刻: ${new Date(scheduledAt).toISOString()}`);
    });
});
