/** @feature SBD-ebaa03c1
 *  Title   : Show search dropdown only on focus
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "../fixtures/console-forward";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SBD-ebaa03c1: search dropdown visibility", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        const ids = await TestHelpers.prepareTestEnvironment(page, testInfo);
        await TestHelpers.createTestPageViaAPI(page, "another-page", ["another page text"]);
        await page.goto(`/${encodeURIComponent(ids.projectName)}/${encodeURIComponent(ids.pageName)}`);

        // Wait for the page to be properly loaded and indexed for search
        await page.waitForTimeout(500);
    });

    test("dropdown only visible when input is focused", async ({ page }) => {
        const searchInput = page.locator(".page-search-box input");
        await expect(searchInput).toBeVisible();

        await searchInput.focus();
        await searchInput.fill("another-page"); // Search for the page name that was created
        const dropdown = page.locator(".page-search-box ul");
        await expect(dropdown).toBeVisible();

        // Clear the input and click outside the search input to hide the dropdown
        await searchInput.clear();
        await page.locator("body").click(); // Click on body to ensure we're outside the search box
        await expect(dropdown).not.toBeVisible();
    });
});
import "../utils/registerAfterEachSnapshot";
