import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

import { expect, test } from "../fixtures/console-forward";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Page Renaming Duplicate Guard", () => {
    test("should refuse to rename a page to an existing title and show error", async ({ page }, testInfo) => {
        // Seed first project with page 'Alpha'
        await TestHelpers.seedProjectAndNavigate(
            page,
            testInfo,
            ["content of Alpha"],
            undefined,
            { pageName: "Alpha" },
        );

        // Wait for page to load
        await expect(page.locator(".outliner-item.page-title")).toContainText("Alpha", { timeout: 10000 });

        // Navigate to Beta page (which does not exist)
        const currentUrl = new URL(page.url());
        const projectPath = currentUrl.pathname.split("/")[1];
        await page.goto(`/${projectPath}/Beta${currentUrl.search}`);

        // Verify the "Page not found" state appears
        await expect(page.locator('text="Page not found"')).toBeVisible();
        await expect(page.locator('text="Create Page"')).toBeVisible();

        // Create the page Beta
        await page.click('button:has-text("Create Page")');

        // Wait for new page to load
        await expect(page.locator(".outliner-item.page-title")).toContainText("Beta", { timeout: 10000 });

        // Double-check the title element to modify it
        const titleLocator = page.locator(".outliner-item.page-title .item-text");

        // Try to rename it to "Alpha"
        // 1. Select all
        await titleLocator.click();

        // Type "Alpha" at the end of "Beta"
        await page.keyboard.type("Alpha", { delay: 50 });

        // Now it's BetaAlpha.
        // Let's delete "Beta" from the beginning. We move cursor to home.
        await page.keyboard.press("Home");
        await page.keyboard.press("Delete"); // B
        await page.keyboard.press("Delete"); // e
        await page.keyboard.press("Delete"); // t
        await page.keyboard.press("Delete"); // a

        // Let's verify we see the error message
        const errorMsg = page.locator("text=A page with this title already exists");
        await expect(errorMsg).toBeVisible({ timeout: 5000 });

        // The title should not be "Alpha"
        await expect(titleLocator).not.toHaveText("Alpha");
    });
});
