import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test.describe("SlashCommandPalette Visibility", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo);
    });

    test("should correctly display the palette and process input after typing /", async ({ page }) => {
        // Wait for items to be loaded
        await TestHelpers.waitForOutlinerItems(page);

        // Find the first outliner item (usually empty on new page)
        const firstItem = page.locator(".outliner-item").first();
        await expect(firstItem).toBeVisible();

        // Click to focus the item (using TestHelpers clicking method for more stability)
        await firstItem.click({ position: { x: 5, y: 5 } });

        // Ensure cursor is active in the item
        await page.waitForSelector(".cursor", { state: "visible" });

        // Type / to open command palette
        await page.keyboard.type("/");

        // Give the UI a moment to react
        await page.waitForTimeout(200);

        // The slash command palette should become visible
        const palette = page.locator(".slash-command-palette");
        await expect(palette).toBeVisible();
        await expect(palette).toHaveAttribute("data-is-visible", "true");

        // Type 'data' into the palette filter (matches the Database command)
        await page.keyboard.type("data");

        await page.waitForTimeout(200);

        // Assert query updated
        await expect(palette).toHaveAttribute("data-query", "data");

        // Assert palette is still visible
        await expect(palette).toBeVisible();

        // Check filtering works (should have Database selected/visible)
        const databaseOption = page.locator('[data-testid="command-item-yjstable"]');
        await expect(databaseOption).toBeVisible();

        // Press enter to insert the database table component
        await page.keyboard.press("Enter");

        // Assert palette is hidden after insertion
        await expect(palette).toBeHidden();

        // Wait a bit for the block to be added to the item
        await page.waitForTimeout(500);

        // A database table block should be in the DOM inside an item
        const tableBlock = page.locator(".component-wrapper, [data-testid='yjs-table-block']");
        await expect(tableBlock.first()).toBeAttached();
    });
});
