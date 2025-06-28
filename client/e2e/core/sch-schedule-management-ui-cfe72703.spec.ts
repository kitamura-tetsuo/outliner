/** @feature SCH-CFE72703
 *  Title   : Scheduled Posting Management UI
 *  Source  : docs/client-features.yaml
 */
import { test, expect } from "@playwright/test";
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
        await page.locator("text=予約管理").click();
        await expect(page.locator("text=Schedule Management")).toBeVisible();

        const input = page.locator('input[type="datetime-local"]');
        const future = new Date(Date.now() + 60_000).toISOString().slice(0,16);
        await input.fill(future);
        await page.locator('button:has-text("Add")').click();

        const items = page.locator('ul li');
        await expect(items).toHaveCount(1);

        await items.first().locator('button:has-text("Cancel")').click();
        await expect(items).toHaveCount(0);
    });
});
