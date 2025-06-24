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
        const id = await TestHelpers.getItemIdByIndex(page, 0);
        await TestHelpers.clickItemToEdit(page, `.outliner-item[data-item-id="${id}"] .item-content`);

        await page.keyboard.type("/");
        await expect(page.locator(".slash-command-palette")).toBeVisible();
        const paletteBox = await page.locator(".slash-command-palette").boundingBox();
        expect(paletteBox?.x).toBeGreaterThan(0);
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("Enter");
        await expect(page.locator(".inline-join-table")).toBeVisible();
    });

    test("filter and insert chart", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page);
        const id = await TestHelpers.getItemIdByIndex(page, 1);
        await TestHelpers.clickItemToEdit(page, `.outliner-item[data-item-id="${id}"] .item-content`);

        await page.keyboard.type("/ch");
        await expect(page.locator(".slash-command-palette")).toBeVisible();
        await expect(page.locator(".slash-command-palette li")).toHaveCount(1);
        await page.keyboard.press("Enter");
        await expect(page.locator(".chart-panel")).toBeVisible();
    });
});
