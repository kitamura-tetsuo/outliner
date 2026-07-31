/** @feature CMD-0001 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

/**
 * Regression test: opening the palette with "/" at the end of an item used to
 * record the slash position one character too early, so the character before
 * the slash was overwritten ("alpha" + "/data" became "alph/data", and the
 * item was left as "alph" once the command string was removed on insert).
 */
test.describe("Command palette preserves the text before the slash", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(90000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["alpha", "beta", "gamma"]);
    });

    test("keeps the item text intact while typing and after inserting the command", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page);

        // Index 0 is the page's own row, so the seeded items start at index 1.
        const alphaId = await TestHelpers.getItemIdByIndex(page, 1);
        if (!alphaId) throw new Error("item id not found");

        await TestHelpers.clickItemToEdit(page, `.outliner-item[data-item-id="${alphaId}"] .item-text`);
        await page.keyboard.press("End");

        await page.keyboard.type("/");
        await expect(page.locator(".slash-command-palette")).toBeVisible();

        const alphaText = page.locator(`.outliner-item[data-item-id="${alphaId}"] .item-text`);
        await expect(alphaText).toHaveText("alpha/");

        await page.keyboard.type("data");
        await expect(alphaText).toHaveText("alpha/data");

        await expect(page.locator('[data-testid="command-item-yjstable"]')).toBeVisible();
        await page.keyboard.press("Enter");
        await expect(page.locator(".slash-command-palette")).toBeHidden();

        // The command string is stripped again, leaving the original text.
        await expect(alphaText).toHaveText("alpha");
    });
});
