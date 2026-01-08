import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { expect, test } from "../fixtures/console-forward";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

test.describe("SEA-0001: search box updates with late-loading pages", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(360000);
        // Start with an empty project
        await TestHelpers.prepareTestEnvironment(page, testInfo, []);
    });

    test("search results update when pages load after typing", async ({ page }) => {
        const searchInput = page.locator(".page-search-box input");
        await expect(searchInput).toBeVisible();

        // Start typing before the target page exists
        await searchInput.fill("second");

        // Now, create the page that matches the search query
        const { projectName } = await page.evaluate(() => (window as any).generalStore.project);
        await TestHelpers.createAndSeedProject(page, null, ["second page content"], {
            projectName,
            pageName: "second-page",
        });

        // The search results should reactively update to include the new page
        const firstResult = page.locator(".page-search-box li").first();
        await expect(firstResult).toBeVisible({ timeout: 30000 });
        await expect(firstResult).toContainText("second-page");

        // Navigate using keyboard
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");

        // Verify navigation
        await expect(page).toHaveURL(/second-page/, { timeout: 30000 });
    });
});
