/** @feature COL-a8219d57
 *  Title   : Yjs collaboration typing sync
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test("typing sync between two browsers", async ({ browser }, testInfo) => {
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    const { projectName, pageName } = await TestHelpers.prepareTestEnvironment(page1, testInfo);
    await page1.goto(`/${projectName}/${pageName}`);

    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await TestHelpers.prepareTestEnvironment(page2, testInfo);
    await page2.goto(`/${projectName}/${pageName}`);

    await page1.locator(".outliner-item .item-text").first().click();
    await page1.keyboard.type("hello");
    await page1.waitForTimeout(500);

    await expect(page2.locator(".outliner-item .item-text").first()).toContainText("hello");
});
