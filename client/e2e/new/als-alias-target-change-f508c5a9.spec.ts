import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("ALS-0001: Alias change target", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("change alias target and update path", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page);
        const firstId = await TestHelpers.getItemIdByIndex(page, 0);
        const secondId = await TestHelpers.getItemIdByIndex(page, 1);
        if (!firstId || !secondId) throw new Error("item ids not found");

        // create alias of first item
        await page.click(`.outliner-item[data-item-id="${firstId}"] .item-content`);
        await page.waitForTimeout(1000);
        await page.evaluate(() => {
            const textarea = document.querySelector(".global-textarea") as HTMLTextAreaElement;
            textarea?.focus();
        });
        await page.waitForTimeout(500);
        await page.keyboard.type("/");
        await page.keyboard.type("alias");
        await page.keyboard.press("Enter");
        await expect(page.locator(".alias-picker")).toBeVisible();
        const newIndex = await page.locator(".outliner-item").count() - 1;
        const aliasId = await TestHelpers.getItemIdByIndex(page, newIndex);
        if (!aliasId) throw new Error("alias item not found");
        const optionCount = await page.locator(".alias-picker li").count();
        expect(optionCount).toBeGreaterThan(0);
        await TestHelpers.selectAliasOption(page, firstId);
        await expect(page.locator(".alias-picker")).toBeHidden();
        let targetSet = await TestHelpers.getAliasTarget(page, aliasId);
        expect(targetSet).toBe(firstId);

        // show picker again and change target
        await TestHelpers.showAliasPicker(page, aliasId);
        await expect(page.locator(".alias-picker")).toBeVisible();
        const optionCount2 = await page.locator(".alias-picker li").count();
        expect(optionCount2).toBeGreaterThan(0);
        await TestHelpers.selectAliasOption(page, secondId);
        await expect(page.locator(".alias-picker")).toBeHidden();
        targetSet = await TestHelpers.getAliasTarget(page, aliasId);
        expect(targetSet).toBe(secondId);

        const secondText = await page.locator(`.outliner-item[data-item-id="${secondId}"] .item-text`).innerText();
        await expect(page.locator(".alias-path")).toContainText(secondText);

        // edit target text and ensure path updates
        await page.click(`.outliner-item[data-item-id="${secondId}"] .item-content`);
        await TestHelpers.setCursor(page, secondId, 0);
        await TestHelpers.insertText(page, secondId, "Z");
        const aliasPathText = await page.locator(".alias-path").innerText();
        expect(aliasPathText.startsWith("Z")).toBeTruthy();
    });
});
