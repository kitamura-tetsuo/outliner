/** @feature ALS-0001
 *  Title   : Alias node referencing existing items
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("ALS-0001: Alias node", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("create and edit alias", async ({ page }) => {
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
        const newIndex = await page.locator('.outliner-item').count() - 1;
        const aliasId = await TestHelpers.getItemIdByIndex(page, newIndex);
        if (!aliasId) throw new Error('alias item not found');
        await TestHelpers.setAliasTarget(page, aliasId, firstId);
        await TestHelpers.hideAliasPicker(page);

        const aliasPath = page.locator('.alias-path');
        await expect(aliasPath).toContainText(firstText);
        const targetInput = `.alias-subtree .outliner-item[data-item-id="${firstId}"] .item-content`;
        await page.click(targetInput);
        await TestHelpers.setCursor(page, firstId, 0);
        await TestHelpers.insertText(page, firstId, "X");

        const textAfter = await page.locator(`.outliner-item[data-item-id="${firstId}"] .item-text`).innerText();
        expect(textAfter.startsWith("X")).toBeTruthy();
    });
});
