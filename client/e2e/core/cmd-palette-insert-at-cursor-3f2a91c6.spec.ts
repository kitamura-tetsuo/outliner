/** @feature CMD-0001 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

/**
 * Regression test for #4512: confirming a command palette entry used to append
 * the new component to the end of the page instead of next to the cursor.
 */
test.describe("Inline command palette insertion position", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(90000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["alpha", "beta", "gamma"]);
    });

    test("inserts the database item right after the item the command was typed in", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page);

        // Index 0 is the page's own row, so the seeded items start at index 1.
        const alphaId = await TestHelpers.getItemIdByIndex(page, 1);
        const betaId = await TestHelpers.getItemIdByIndex(page, 2);
        if (!alphaId || !betaId) throw new Error("item ids not found");

        await TestHelpers.clickItemToEdit(page, `.outliner-item[data-item-id="${alphaId}"] .item-text`);
        await page.keyboard.type("/");
        await expect(page.locator(".slash-command-palette")).toBeVisible();
        await page.keyboard.type("data");
        await expect(page.locator('[data-testid="command-item-yjstable"]')).toBeVisible();
        await page.keyboard.press("Enter");
        await expect(page.locator(".slash-command-palette")).toBeHidden();

        // The new item is a sibling of "alpha", positioned between "alpha" and "beta".
        const items = page.locator(".outliner-item[data-item-id]");
        await expect(items).toHaveCount(5);
        await expect(items.nth(1)).toHaveAttribute("data-item-id", alphaId);
        await expect(items.nth(3)).toHaveAttribute("data-item-id", betaId);

        const insertedId = await items.nth(2).getAttribute("data-item-id");
        expect(insertedId).not.toBe(alphaId);
        expect(insertedId).not.toBe(betaId);
    });

    test("inserts the alias item right after the item the command was typed in", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page);

        const alphaId = await TestHelpers.getItemIdByIndex(page, 1);
        const betaId = await TestHelpers.getItemIdByIndex(page, 2);
        if (!alphaId || !betaId) throw new Error("item ids not found");

        await TestHelpers.clickItemToEdit(page, `.outliner-item[data-item-id="${alphaId}"] .item-text`);
        await page.keyboard.type("/");
        await page.keyboard.type("alias");
        await page.keyboard.press("Enter");

        await expect(page.locator(".alias-picker").first()).toBeVisible();
        const aliasId = await page.evaluate(() =>
            (globalThis as unknown as { aliasPickerStore?: { itemId?: string; }; }).aliasPickerStore?.itemId ?? null
        );
        if (!aliasId) throw new Error("alias item not found on aliasPickerStore");

        const items = page.locator(".outliner-item[data-item-id]");
        await expect(items).toHaveCount(5);
        await expect(items.nth(1)).toHaveAttribute("data-item-id", alphaId);
        await expect(items.nth(2)).toHaveAttribute("data-item-id", aliasId);
        await expect(items.nth(3)).toHaveAttribute("data-item-id", betaId);
    });
});
