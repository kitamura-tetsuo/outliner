import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SCH-CFE72703
 *  Title   : Scheduled Posting Management UI
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Schedule Management UI", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("open schedule screen", async ({ page }) => {
        await page.locator("text=予約管理").click();
        await expect(page.locator("text=Schedule Management")).toBeVisible();
    });

    test("create and cancel schedule", async ({ page }) => {
        // コンソールログを監視
        page.on("console", msg => {
            if (msg.text().includes("Schedule page:")) {
                console.log("Browser console:", msg.text());
            }
        });

        await page.locator("text=予約管理").click();
        await expect(page.locator("text=Schedule Management")).toBeVisible();

        // ページが完全に読み込まれるまで少し待つ
        await page.waitForTimeout(500);

        // ページの状態をログ出力
        const pageId = await page.evaluate(() => {
            return (window as any).appStore?.currentPage?.id || "undefined";
        });
        console.log("Test: Current page ID:", pageId);

        const input = page.locator('input[type="datetime-local"]');
        const future = new Date(Date.now() + 60_000).toISOString().slice(0, 16);
        await input.fill(future);

        console.log("Test: Clicking Add button with datetime:", future);
        await page.locator('button:has-text("Add")').click();

        // スケジュール追加後、少し待つ
        await page.waitForTimeout(500);

        // スケジュール専用のセレクターを使用
        const scheduleItems = page.locator('[data-testid="schedule-item"]');
        await expect(scheduleItems).toHaveCount(1);

        await scheduleItems.first().locator('button:has-text("Cancel")').click();
        await expect(scheduleItems).toHaveCount(0);
    });
});
