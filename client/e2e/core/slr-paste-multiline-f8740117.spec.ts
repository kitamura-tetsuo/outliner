/** @feature SLR-0006
 *  Title   : Copy and paste multiple item selection ranges
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SLR-0006: Copy and paste multiple item selection ranges", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("複数行テキストをペーストすると適切に複数アイテムに分割される", async ({ page }) => {
        const firstItem = page.locator(".outliner-item").nth(0);
        await firstItem.locator(".item-content").click({ force: true });
        const clipboardText = "line1\nline2\nline3";
        await page.evaluate(async text => await navigator.clipboard.writeText(text), clipboardText);
        await page.keyboard.press("Control+V");
        await page.waitForTimeout(500);
        const items = page.locator(".outliner-item");
        expect(await items.count()).toBeGreaterThan(1);
    });
});
import "../utils/registerAfterEachSnapshot";
