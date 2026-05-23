import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.beforeEach(async ({ page }, testInfo) => {
    test.setTimeout(90000);
    await TestHelpers.seedProjectAndNavigate(page, testInfo);
});

test("Toolbar 'Add Database' button inserts a Database (table) component", async ({ page }) => {
    // Wait for the outliner items to load
    await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });

    // Click the first item to focus it
    await page.locator(".outliner-item").first().click();

    // Type a key to ensure the global textarea catches the focus
    await page.keyboard.type("setup");
    await page.waitForTimeout(500);

    // Click the Add Database button in the main-toolbar
    const addDatabaseBtn = page.getByTestId("main-toolbar").locator('.add-database-btn').last();
    await expect(addDatabaseBtn).toBeVisible({ timeout: 10000 });
    await addDatabaseBtn.click();

    // Check for the inserted inline-join-table block
    const inlineTable = page.locator('.inline-join-table').first();
    await expect(inlineTable).toBeVisible({ timeout: 10000 });
});
