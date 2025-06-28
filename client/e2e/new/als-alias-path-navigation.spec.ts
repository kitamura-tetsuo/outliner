import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("ALS-0001: Alias path navigation", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("alias path shows clickable links", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page);
        const firstId = await TestHelpers.getItemIdByIndex(page, 0);
        if (!firstId) throw new Error("first item not found");

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
        const firstText = await page.locator(`.outliner-item[data-item-id="${firstId}"] .item-text`).innerText();
        const newIndex = await page.locator(".outliner-item").count() - 1;
        const aliasId = await TestHelpers.getItemIdByIndex(page, newIndex);
        if (!aliasId) throw new Error("alias item not found");
        const optionCount = await page.locator(".alias-picker li").count();
        expect(optionCount).toBeGreaterThan(0);
        await TestHelpers.selectAliasOption(page, firstId);
        await expect(page.locator(".alias-picker")).toBeHidden();

        const targetSet = await TestHelpers.getAliasTarget(page, aliasId);
        expect(targetSet).toBe(firstId);

        const links = page.locator(".alias-path a");
        await expect(links).toHaveCount(1);
        await expect(links.first()).toContainText(firstText);
        await links.first().click();
        await page.waitForTimeout(500);
        const activeId = await TestHelpers.getActiveItemId(page);
        expect(activeId).toBe(firstId);

        await TestHelpers.setCursor(page, firstId, 0);
        await TestHelpers.insertText(page, firstId, "Y");
        const aliasPathTextAfter = await page.locator(".alias-path").innerText();
        expect(aliasPathTextAfter.startsWith("Y")).toBeTruthy();
    });
});
