
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test.describe("Sidebar Tables Section (SBD-3845abcd)", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Database table demo item"]);
    });

    test("checks the appearance of tables section in the sidebar", async ({ page }) => {
        // Open the sidebar
        const menuButton = page.locator('button[aria-label="Toggle menu"]');
        if (await menuButton.isVisible()) {
            await menuButton.click();
        }

        const sidebar = page.locator('aside.sidebar[aria-label="Main Sidebar"]');
        await expect(sidebar).toBeVisible({ timeout: 10000 });

        // Ensure tables section is visible
        const tablesHeader = sidebar.locator('button[aria-label="Toggle tables section"]');
        await expect(tablesHeader).toBeVisible();
        if (await tablesHeader.getAttribute("aria-expanded") === "false") {
            await tablesHeader.click();
        }

        // We check for the placeholder "No tables available"
        const tablesList = sidebar.locator('#sidebar-tables-list');
        await expect(tablesList.locator('li.sidebar-placeholder', { hasText: 'No tables available' })).toBeVisible({ timeout: 10000 });
    });
});
