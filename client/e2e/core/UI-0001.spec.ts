/** @feature UI-0001 */
/**
 * UI-0001: スケジュール公開ダイアログのテスト
 * スケジュール公開ダイアログの基本的な機能をテストする
 */

import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("UI-0001: スケジュール公開ダイアログ", () => {
    test.beforeEach(async ({ page }) => {
        await TestHelpers.prepareTestEnvironment(page);
    });

    test("ダイアログが正しく表示される", async ({ page }) => {
        // テスト用のページに移動
        await page.goto("/test-project/test-page");

        // スケジュール公開ダイアログを開くボタンをクリック
        // （実際の実装では、下書き一覧からスケジュール公開ボタンをクリック）
        await page.click('[data-testid="schedule-publish-button"]');

        // ダイアログが表示されることを確認
        await expect(page.locator('[role="dialog"]')).toBeVisible();
        await expect(page.locator("#dialog-title")).toHaveText("スケジュール公開");

        // フォーム要素が表示されることを確認
        await expect(page.locator("#scheduled-date")).toBeVisible();
        await expect(page.locator("#scheduled-time")).toBeVisible();
        await expect(page.locator('input[type="checkbox"]')).toBeVisible();

        // ボタンが表示されることを確認
        await expect(page.locator('[role="dialog"] .cancel-button')).toBeVisible();
        await expect(page.locator('[role="dialog"] .schedule-button')).toBeVisible();
    });

    test("日時入力が正しく動作する", async ({ page }) => {
        await page.goto("/test-project/test-page");
        await page.click('[data-testid="schedule-publish-button"]');

        // 明日の日付を設定
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dateString = tomorrow.toISOString().split("T")[0];

        await page.fill("#scheduled-date", dateString);
        await page.fill("#scheduled-time", "14:30");

        // 入力値が正しく設定されることを確認
        await expect(page.locator("#scheduled-date")).toHaveValue(dateString);
        await expect(page.locator("#scheduled-time")).toHaveValue("14:30");

        // スケジュールボタンが有効になることを確認
        await expect(page.locator('[role="dialog"] .schedule-button')).not.toBeDisabled();
    });

    test("リトライ設定が正しく動作する", async ({ page }) => {
        await page.goto("/test-project/test-page");
        await page.click('[data-testid="schedule-publish-button"]');

        // リトライ設定のチェックボックスを確認
        const retryCheckbox = page.locator('input[type="checkbox"]');
        await expect(retryCheckbox).toBeChecked(); // デフォルトで有効

        // リトライ設定フィールドが表示されることを確認
        await expect(page.locator("#max-retries")).toBeVisible();
        await expect(page.locator("#retry-delay")).toBeVisible();

        // リトライ設定を変更
        await page.fill("#max-retries", "5");
        await page.fill("#retry-delay", "10");

        // 値が正しく設定されることを確認
        await expect(page.locator("#max-retries")).toHaveValue("5");
        await expect(page.locator("#retry-delay")).toHaveValue("10");

        // チェックボックスを無効にする
        await retryCheckbox.uncheck();

        // リトライ設定フィールドが非表示になることを確認
        await expect(page.locator("#max-retries")).not.toBeVisible();
        await expect(page.locator("#retry-delay")).not.toBeVisible();
    });

    test("バリデーションが正しく動作する", async ({ page }) => {
        await page.goto("/test-project/test-page");
        await page.click('[data-testid="schedule-publish-button"]');

        // 初期状態では未来の日時が設定されているため、ボタンは有効
        await expect(page.locator('[role="dialog"] .schedule-button')).not.toBeDisabled();

        // 日時をクリアして無効状態をテスト
        await page.fill("#scheduled-date", "");
        await page.fill("#scheduled-time", "");

        // 日時が空の場合はスケジュールボタンが無効
        await expect(page.locator('[role="dialog"] .schedule-button')).toBeDisabled();

        // 過去の日時を設定
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dateString = yesterday.toISOString().split("T")[0];

        await page.fill("#scheduled-date", dateString);
        await page.fill("#scheduled-time", "14:30");

        // スケジュールボタンが無効のままであることを確認
        await expect(page.locator('[role="dialog"] .schedule-button')).toBeDisabled();

        // 未来の日時を設定
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const futureDateString = tomorrow.toISOString().split("T")[0];

        await page.fill("#scheduled-date", futureDateString);

        // スケジュールボタンが有効になることを確認
        await expect(page.locator('[role="dialog"] .schedule-button')).not.toBeDisabled();
    });

    test("ダイアログを閉じる操作が正しく動作する", async ({ page }) => {
        await page.goto("/test-project/test-page");
        await page.click('[data-testid="schedule-publish-button"]');

        // ダイアログが表示されることを確認
        await expect(page.locator('[role="dialog"]')).toBeVisible();

        // 閉じるボタンでダイアログを閉じる
        await page.click(".close-button");
        await expect(page.locator('[role="dialog"]')).not.toBeVisible();

        // 再度ダイアログを開く
        await page.click('[data-testid="schedule-publish-button"]');
        await expect(page.locator('[role="dialog"]')).toBeVisible();

        // キャンセルボタンでダイアログを閉じる
        await page.click('[role="dialog"] .cancel-button');
        await expect(page.locator('[role="dialog"]')).not.toBeVisible();

        // 再度ダイアログを開く
        await page.click('[data-testid="schedule-publish-button"]');
        await expect(page.locator('[role="dialog"]')).toBeVisible();

        // Escapeキーでダイアログを閉じる
        await page.keyboard.press("Escape");
        await expect(page.locator('[role="dialog"]')).not.toBeVisible();

        // 再度ダイアログを開く
        await page.click('[data-testid="schedule-publish-button"]');
        await expect(page.locator('[role="dialog"]')).toBeVisible();

        // オーバーレイクリックでダイアログを閉じる
        await page.click(".dialog-overlay", { position: { x: 10, y: 10 } });
        await expect(page.locator('[role="dialog"]')).not.toBeVisible();
    });

    test("スケジュール作成が正しく動作する", async ({ page }) => {
        await page.goto("/test-project/test-page");
        await page.click('[data-testid="schedule-publish-button"]');

        // 未来の日時を設定
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dateString = tomorrow.toISOString().split("T")[0];

        await page.fill("#scheduled-date", dateString);
        await page.fill("#scheduled-time", "14:30");

        // リトライ設定を変更
        await page.fill("#max-retries", "3");
        await page.fill("#retry-delay", "5");

        // スケジュールボタンをクリック
        await page.click('[role="dialog"] .schedule-button');

        // ローディング状態が一瞬表示される可能性があるが、テスト環境では即座に完了する
        // ダイアログが閉じることを確認（テスト環境ではモック処理で即座に完了）
        await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 });

        // 成功メッセージまたはスケジュール状態の表示を確認
        // （実際の実装に応じて調整）
        await expect(page.locator('[data-testid="schedule-status"]')).toBeVisible();
    });

    test("エラーハンドリングが正しく動作する", async ({ page }) => {
        await page.goto("/test-project/test-page");

        // エラーを発生させるためのフラグを設定
        await page.evaluate(() => {
            (window as any).__TEST_FORCE_ERROR__ = true;
        });

        await page.click('[data-testid="schedule-publish-button"]');

        // 未来の日時を設定
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dateString = tomorrow.toISOString().split("T")[0];

        await page.fill("#scheduled-date", dateString);
        await page.fill("#scheduled-time", "14:30");

        // スケジュールボタンをクリック
        await page.click('[role="dialog"] .schedule-button');

        // エラーメッセージが表示されることを確認
        await expect(page.locator('[role="dialog"] .error-message')).toBeVisible();
        await expect(page.locator('[role="dialog"] .error-message')).toContainText("テスト用のエラーです");

        // ダイアログが開いたままであることを確認
        await expect(page.locator('[role="dialog"]')).toBeVisible();

        // ボタンが再度有効になることを確認
        await expect(page.locator('[role="dialog"] .schedule-button')).not.toBeDisabled();
    });
});
