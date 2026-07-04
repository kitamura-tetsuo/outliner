import { test, expect } from "@playwright/test";
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
        const firstItem = page.locator('.outliner-item').first();
        await expect(firstItem).toBeVisible();

        // Click to focus the item (using TestHelpers clicking method for more stability)
        await firstItem.click({ position: { x: 5, y: 5 } });

        // Ensure cursor is active in the item
        await page.waitForSelector('.cursor', { state: 'visible' });

        // Type / to open command palette
        await page.keyboard.type("/");

        // Give the UI a moment to react
        await page.waitForTimeout(200);

        // The slash command palette should become visible
        const palette = page.locator(".slash-command-palette");
        await expect(palette).toBeVisible();
        await expect(palette).toHaveAttribute("data-is-visible", "true");

        // Type 'chart' into the palette filter
        await page.keyboard.type("chart");

        await page.waitForTimeout(200);

        // Assert query updated
        await expect(palette).toHaveAttribute("data-query", "chart");

        // Assert palette is still visible
        await expect(palette).toBeVisible();

        // Check filtering works (should have Chart selected/visible)
        const chartOption = page.locator('[data-testid="command-item-chart"]');
        await expect(chartOption).toBeVisible();

        // Press enter to insert chart component
        await page.keyboard.press("Enter");

        // Assert palette is hidden after insertion
        await expect(palette).toBeHidden();

        // Wait a bit for the chart to be added to the item
        await page.waitForTimeout(500);

        // A chart component should be in the DOM inside an item
        // Note: Svelte might render the component-wrapper, but it can be visually hidden depending on the specific component state
        const chartIcon = page.locator(".component-wrapper, .chart-container, [data-component-type='chart']");
        await expect(chartIcon.first()).toBeAttached();
    });
});
