/** @feature PRS-b13f9c1a
 * Title   : Cursor sync between tabs
 * Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import "../utils/registerAfterEachSnapshot";

test.describe("Cursor sync between tabs", () => {
    test("typing in one tab shows in another", async ({ browser }, testInfo) => {
        const context1 = await browser.newContext();
        const page1 = await context1.newPage();
        await TestHelpers.prepareTestEnvironment(page1, testInfo);

        const context2 = await browser.newContext();
        const page2 = await context2.newPage();
        await TestHelpers.prepareTestEnvironment(page2, testInfo);

        await TestHelpers.waitForElementVisible(page1, ".outliner-item", 10000);
        const root1 = page1.locator(".outliner-item").first();
        await root1.locator(".item-content").click({ force: true });
        await page1.keyboard.type("hello");

        await TestHelpers.waitForElementVisible(page2, ".outliner-item", 10000);
        const root2 = page2.locator(".outliner-item").first();
        await expect(root2.locator(".item-text")).toContainText("hello", { timeout: 20000 });

        await context1.close();
        await context2.close();
    });
});
