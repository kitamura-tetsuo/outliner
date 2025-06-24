/** @feature CMD-0001
 *  Title   : Inline Command Palette
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("CMD-0001: Inline Command Palette", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("insert table via palette", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page);
        const first = page.locator(".outliner-item .item-content").first();
        await first.click();
        await TestHelpers.waitForCursorVisible(page);

        await page.keyboard.type("/");
        await expect(page.locator(".slash-command-palette")).toBeVisible();
        await page.click(".slash-command-palette button:has-text('Table')");
        await expect(page.locator(".inline-join-table")).toBeVisible();
    });

    test("insert chart via palette", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page);
        const last = page.locator(".outliner-item .item-content").last();
        await last.click();
        await TestHelpers.waitForCursorVisible(page);

        await page.keyboard.type("/");
        await expect(page.locator(".slash-command-palette")).toBeVisible();
        await page.click(".slash-command-palette button:has-text('Chart')");
        await expect(page.locator(".chart-panel")).toBeVisible();
    });
});
