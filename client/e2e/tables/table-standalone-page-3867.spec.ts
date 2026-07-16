import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Standalone Table Page (#3867)", () => {
    test.beforeEach(async ({ page }) => {
        // Mock API responses for user list to prevent spurious errors
        await page.route("**/api/user-list", (route) => route.fulfill({ json: { users: [] } }));
        await page.route("**/api/list-projects", (route) => route.fulfill({ json: { projects: [] } }));
    });

    test("navigates to standalone table page from sidebar and renders grid", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Table Test Page"]);

        // Wait for page editor to load
        await page.waitForSelector(".item-content", { timeout: 10000 });

        // Ensure outliner item is focused
        await page.click(".item-content:first-of-type");

        // 1. Create a table item
        await page.keyboard.type("/database");
        await page.keyboard.press("Enter");

        // Wait for table creation panel
        await page.waitForSelector('[data-testid="yjs-table-create-panel"]');

        // Provide a unique table name
        const tableName = `TestTable-${Date.now()}`;
        await page.fill('[data-testid="yjs-table-name-input"]', tableName);

        // Create table
        await page.click('[data-testid="yjs-table-create"]');

        // Wait for table to render embedded
        await page.waitForSelector(".yjs-table-grid", { timeout: 10000 });

        // 2. Open sidebar and find table entry
        // Open sidebar if it's not already open
        const sidebarToggle = page.locator(
            'button[aria-label="Open Sidebar"], button[aria-label="Close Sidebar"], button[aria-label="Toggle Sidebar"], .sidebar-toggle',
        );
        const count = await sidebarToggle.count();
        if (count > 0) {
            await sidebarToggle.first().click();
        }

        // Check tables section is visible
        const tablesSection = page.locator("#sidebar-tables-list");
        await expect(tablesSection).toBeVisible();

        // Click the specific table in sidebar
        const tableLink = page.locator(`a.page-item:has-text("${tableName}")`);
        await expect(tableLink).toBeVisible();
        await tableLink.click();

        // 3. Verify URL navigation and table rendering
        await expect(page).toHaveURL(new RegExp(`/tables/.*/${encodeURIComponent(tableName)}`));

        // Ensure table is rendered on standalone page
        await page.waitForSelector(".yjs-table-grid", { timeout: 10000 });

        // Check breadcrumb
        await expect(page.locator("nav, .breadcrumb")).toContainText(tableName);
    });
});
