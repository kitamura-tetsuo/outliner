import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test("debug internal link html", async ({ page }, testInfo) => {
    await TestHelpers.prepareTestEnvironment(page, testInfo);

    const items = page.locator(".outliner-item");
    await expect(items).toHaveCount(4, { timeout: 10000 });

    const firstItem = items.nth(1);
    await firstItem.locator(".item-content").click();
    await TestHelpers.waitForCursorVisible(page);
    await page.keyboard.type("[test-page]");

    await page.keyboard.press("Enter");
    await TestHelpers.waitForCursorVisible(page);
    await page.keyboard.type("別のアイテム");

    await page.keyboard.press("Enter");
    await TestHelpers.waitForCursorVisible(page);
    await page.keyboard.type("3つ目のアイテム");

    await page.waitForTimeout(300);

    const html = await firstItem.locator(".item-text").innerHTML();
    console.log("first item html", html);
});
