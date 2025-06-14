/**
 * UI-0002: スケジュール状態表示UIのテスト
 * スケジュール状態表示UIコンポーネントの機能をテストする
 */

import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("UI-0002: スケジュール状態表示UI", () => {
    test.beforeEach(async ({ page }) => {
        await TestHelpers.prepareTestEnvironment(page);
    });

    test("スケジュール済み状態が正しく表示される", async ({ page }) => {
        // テスト用のスケジュールデータを設定
        await page.goto("/test-project/test-page");

        // スケジュール状態コンポーネントが表示されることを確認
        const scheduleStatusContainer = page.locator('[data-testid="schedule-status"]');
        await expect(scheduleStatusContainer).toBeVisible();

        const scheduleStatus = scheduleStatusContainer.locator(".schedule-status");
        await expect(scheduleStatus).toBeVisible();

        // スケジュール済み状態の表示を確認
        await expect(scheduleStatus.locator(".status-icon")).toContainText("⏰");
        await expect(scheduleStatus.locator(".status-text")).toContainText("スケジュール済み");
        await expect(scheduleStatus).toHaveClass(/status-scheduled/);

        // 実行予定時刻が表示されることを確認
        await expect(scheduleStatus.locator(".scheduled-time")).toBeVisible();

        // 残り時間が表示されることを確認
        await expect(scheduleStatus.locator(".time-until")).toBeVisible();

        // 編集・キャンセルボタンが表示されることを確認
        await expect(scheduleStatus.locator(".edit-button")).toBeVisible();
        await expect(scheduleStatus.locator(".cancel-button")).toBeVisible();
    });

    test("実行中状態が正しく表示される", async ({ page }) => {
        // 実行中状態のテストデータを設定
        await page.evaluate(() => {
            window.__TEST_SCHEDULE_STATUS__ = "processing";
        });

        await page.goto("/test-project/test-page");

        const scheduleStatus = page.locator('[data-testid="schedule-status"] .schedule-status');

        // 実行中状態の表示を確認
        await expect(scheduleStatus.locator(".status-icon")).toContainText("🔄");
        await expect(scheduleStatus.locator(".status-text")).toContainText("実行中");
        await expect(scheduleStatus).toHaveClass(/status-running/);

        // 編集・キャンセルボタンが非表示であることを確認
        await expect(scheduleStatus.locator(".edit-button")).not.toBeVisible();
        await expect(scheduleStatus.locator(".cancel-button")).not.toBeVisible();
    });

    test("完了状態が正しく表示される", async ({ page }) => {
        // 完了状態のテストデータを設定
        await page.evaluate(() => {
            window.__TEST_SCHEDULE_STATUS__ = "published";
        });

        await page.goto("/test-project/test-page");

        const scheduleStatus = page.locator('[data-testid="schedule-status"] .schedule-status');

        // 完了状態の表示を確認
        await expect(scheduleStatus.locator(".status-icon")).toContainText("✅");
        await expect(scheduleStatus.locator(".status-text")).toContainText("完了");
        await expect(scheduleStatus).toHaveClass(/status-completed/);

        // 残り時間が表示されないことを確認
        await expect(scheduleStatus.locator(".time-until")).not.toBeVisible();
    });

    test("失敗状態が正しく表示される", async ({ page }) => {
        // 失敗状態のテストデータを設定
        await page.evaluate(() => {
            window.__TEST_SCHEDULE_STATUS__ = "failed";
            window.__TEST_RETRY_COUNT__ = 2;
        });

        await page.goto("/test-project/test-page");

        const scheduleStatus = page.locator('[data-testid="schedule-status"] .schedule-status');

        // 失敗状態の表示を確認
        await expect(scheduleStatus.locator(".status-icon")).toContainText("❌");
        await expect(scheduleStatus.locator(".status-text")).toContainText("失敗");
        await expect(scheduleStatus).toHaveClass(/status-failed/);

        // リトライ回数が表示されることを確認
        await expect(scheduleStatus.locator(".retry-info")).toBeVisible();
        await expect(scheduleStatus.locator(".retry-info")).toContainText("リトライ回数: 2");
    });

    test("キャンセル済み状態が正しく表示される", async ({ page }) => {
        // キャンセル済み状態のテストデータを設定
        await page.evaluate(() => {
            window.__TEST_SCHEDULE_STATUS__ = "cancelled";
        });

        await page.goto("/test-project/test-page");

        const scheduleStatus = page.locator('[data-testid="schedule-status"] .schedule-status');

        // キャンセル済み状態の表示を確認
        await expect(scheduleStatus.locator(".status-icon")).toContainText("⏹️");
        await expect(scheduleStatus.locator(".status-text")).toContainText("キャンセル済み");
        await expect(scheduleStatus).toHaveClass(/status-cancelled/);
    });

    test("時刻表示が正しく動作する", async ({ page }) => {
        // 今日の時刻でテスト
        const today = new Date();
        today.setHours(14, 30, 0, 0);

        // ページ読み込み前にテストデータを設定
        await page.goto("/test-project/test-page");

        await page.evaluate(timestamp => {
            window.__TEST_SCHEDULED_TIME__ = timestamp;
        }, today.getTime());

        // データが反映されるまで少し待つ
        await page.waitForTimeout(200);

        const scheduleStatus = page.locator('[data-testid="schedule-status"] .schedule-status');

        // 今日の場合は時刻のみ表示されることを確認（実際の表示形式に合わせる）
        const expectedTimeText = today.toLocaleTimeString("ja-JP", {
            hour: "2-digit",
            minute: "2-digit",
        });
        await expect(scheduleStatus.locator(".scheduled-time")).toContainText(expectedTimeText);

        // 明日の時刻でテスト
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(14, 30, 0, 0);

        await page.evaluate(timestamp => {
            window.__TEST_SCHEDULED_TIME__ = timestamp;
        }, tomorrow.getTime());

        // データが反映されるまで少し待つ
        await page.waitForTimeout(200);

        // 明日の場合は月日と時刻が表示されることを確認
        await expect(scheduleStatus.locator(".scheduled-time")).toContainText("14:30");
    });

    test("残り時間計算が正しく動作する", async ({ page }) => {
        // 1時間後の時刻を設定
        const oneHourLater = new Date();
        oneHourLater.setHours(oneHourLater.getHours() + 1);

        await page.evaluate(timestamp => {
            window.__TEST_SCHEDULED_TIME__ = timestamp;
            window.__TEST_SCHEDULE_STATUS__ = "scheduled";
        }, oneHourLater.getTime());

        await page.goto("/test-project/test-page");

        const scheduleStatus = page.locator('[data-testid="schedule-status"] .schedule-status');

        // 残り時間が表示されることを確認
        await expect(scheduleStatus.locator(".time-until")).toBeVisible();

        // 実際の残り時間を計算して確認
        const now = Date.now();
        const diff = oneHourLater.getTime() - now;
        const minutes = Math.floor(diff / (1000 * 60));
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            await expect(scheduleStatus.locator(".time-until")).toContainText(`${hours}時間後`);
        }
        else {
            await expect(scheduleStatus.locator(".time-until")).toContainText("分後");
        }

        // 30分後の時刻を設定
        const thirtyMinutesLater = new Date();
        thirtyMinutesLater.setMinutes(thirtyMinutesLater.getMinutes() + 30);

        await page.evaluate(timestamp => {
            window.__TEST_SCHEDULED_TIME__ = timestamp;
        }, thirtyMinutesLater.getTime());

        await page.reload();

        // 分単位で表示されることを確認
        await expect(scheduleStatus.locator(".time-until")).toContainText("分後");
    });

    test("コンパクト表示モードが正しく動作する", async ({ page }) => {
        await page.evaluate(() => {
            window.__TEST_COMPACT_MODE__ = true;
        });

        await page.goto("/test-project/test-page");

        const scheduleStatus = page.locator('[data-testid="schedule-status-compact"] .schedule-status');

        // コンパクトモードのクラスが適用されることを確認
        await expect(scheduleStatus).toHaveClass(/compact/);

        // ステータスヘッダーが非表示であることを確認
        await expect(scheduleStatus.locator(".status-header")).not.toBeVisible();

        // 残り時間が非表示であることを確認
        await expect(scheduleStatus.locator(".time-until")).not.toBeVisible();

        // アクションボタンが非表示であることを確認
        await expect(scheduleStatus.locator(".actions")).not.toBeVisible();

        // アイコンと時刻は表示されることを確認
        await expect(scheduleStatus.locator(".status-icon")).toBeVisible();
        await expect(scheduleStatus.locator(".scheduled-time")).toBeVisible();
    });

    test("編集ボタンが正しく動作する", async ({ page }) => {
        await page.goto("/test-project/test-page");

        const scheduleStatus = page.locator('[data-testid="schedule-status"] .schedule-status');

        // 編集ボタンをクリック
        await scheduleStatus.locator(".edit-button").click();

        // 編集イベントが発火されることを確認
        // （実際の実装では、親コンポーネントで編集ダイアログが開かれる）
        await expect(page.locator('[data-testid="edit-event-fired"]')).toBeVisible();
    });

    test("キャンセルボタンが正しく動作する", async ({ page }) => {
        await page.goto("/test-project/test-page");

        const scheduleStatus = page.locator('[data-testid="schedule-status"] .schedule-status');

        // キャンセルボタンをクリック
        await scheduleStatus.locator(".cancel-button").click();

        // キャンセル処理中の状態が表示されることを確認
        await expect(scheduleStatus.locator(".cancel-button")).toHaveText("キャンセル中...");
        await expect(scheduleStatus.locator(".cancel-button")).toBeDisabled();

        // キャンセル完了を待つ
        await page.waitForTimeout(1000);

        // キャンセル完了後の状態確認
        await expect(page.locator('[data-testid="cancel-event-fired"]')).toBeVisible();
    });

    test("データ更新が正しく動作する", async ({ page }) => {
        await page.goto("/test-project/test-page");

        const scheduleStatus = page.locator('[data-testid="schedule-status"] .schedule-status');

        // 初期状態を確認
        await expect(scheduleStatus.locator(".status-text")).toContainText("スケジュール済み");

        // データを更新
        await page.evaluate(() => {
            window.__TEST_SCHEDULE_STATUS__ = "processing";
        });

        // リフレッシュ機能をトリガー
        await page.click('[data-testid="refresh-schedule"]');

        // 状態が更新されることを確認
        await expect(scheduleStatus.locator(".status-text")).toContainText("実行中");
    });

    test("ローディング状態が正しく表示される", async ({ page }) => {
        await page.evaluate(() => {
            window.__TEST_LOADING_STATE__ = true;
        });

        await page.goto("/test-project/test-page");

        const scheduleStatus = page.locator('[data-testid="schedule-status"] .schedule-status');

        // ローディング状態の表示を確認
        await expect(scheduleStatus).toHaveClass(/loading/);
        await expect(scheduleStatus.locator(".loading-text")).toBeVisible();
        await expect(scheduleStatus.locator(".loading-text")).toContainText("読み込み中...");
    });
});
