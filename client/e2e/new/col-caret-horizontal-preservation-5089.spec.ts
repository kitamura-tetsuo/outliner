import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Caret Horizontal Position Preservation", () => {
    test("ArrowUp and ArrowDown preserves caret horizontal position across items", async ({ page }) => {
        const info = await TestHelpers.seedProjectAndNavigate(page, test.info());

        await page.goto(
            `http://localhost:7090/${encodeURIComponent(info.projectName)}/${encodeURIComponent(info.pageName)}`,
        );

        await TestHelpers.waitForOutlinerItems(page);

        // Wait for page to initialize fully
        await page.waitForTimeout(500);

        // Click the first item to focus it
        const titleLocator = page.locator(".outliner-item .item-text").first();
        await titleLocator.click();

        // Add 3 items below it
        for (let i = 0; i < 3; i++) {
            await page.keyboard.press("End");
            await page.keyboard.press("Enter");
            await page.waitForTimeout(100);
        }

        // At this point we have title + 3 empty items = 4 items
        await expect(page.locator(".outliner-item")).toHaveCount(4);

        // Fill them
        // We are on the 4th item
        await page.keyboard.insertText("123");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.insertText("123456789");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.insertText("abcdefghi");

        // We are on the 2nd item (first item is title). It says "abcdefghi|".
        // Move to column 6 ("abcdef|ghi")
        await page.keyboard.press("Home");
        for (let i = 0; i < 6; i++) {
            await page.keyboard.press("ArrowRight");
        }

        await page.keyboard.press("ArrowDown");
        // We do NOT type here, to preserve initialColumn=6
        await page.keyboard.press("ArrowDown");
        // We are now on "123|" which is length 3. If we typed, we would type at pos 3.
        await page.keyboard.insertText("Y"); // "123Y". Now column is 4. initialColumn is reset to 4.

        // Now if we press ArrowUp, it will use initialColumn=4.
        // Let's reset initialColumn to 6 manually by navigating left and right
        await page.keyboard.press("ArrowUp"); // go up to "123456789", we should be at "1234|56789" (col 4)

        // Verify output visually
        await page.keyboard.insertText("Z"); // "1234Z56789"

        const items = page.locator(".outliner-item");
        await expect(items.nth(1).locator(".item-text")).toHaveText("abcdefghi");
        await expect(items.nth(2).locator(".item-text")).toHaveText("1234Z56789");
        await expect(items.nth(3).locator(".item-text")).toHaveText("123Y");

        // Verify ArrowUp again
        await page.keyboard.press("ArrowUp"); // go up to "abcdefghi" from "1234Z56789"
        // Since we typed Z, initialColumn was reset to 5 ("1234Z|")
        // So we should end up at "abcde|fghi" (col 5)
        await page.keyboard.insertText("Q");
        await expect(items.nth(1).locator(".item-text")).toHaveText("abcdeQfghi");
    });
});
