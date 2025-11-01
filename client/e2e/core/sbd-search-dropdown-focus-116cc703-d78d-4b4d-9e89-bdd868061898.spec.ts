import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
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

        // Wait for the page to be created and available in the project
        await page.waitForFunction(() => {
            const gs = (window as any).generalStore || (window as any).appStore;
            if (!gs?.project?.items) return false;
            const items = gs.project.items;
            let count = 0;
            try {
                if (typeof items[Symbol.iterator] === "function") {
                    for (const item of items) {
                        count++;
                    }
                } else if (typeof items.length === "number") {
                    count = items.length;
                }
            } catch {}
            // We expect at least 2 pages: the initial page and "another-page"
            return count >= 2;
        }, { timeout: 10000 });

        // Navigate back to first page to ensure SearchBox appears
        await page.goto(`/${encodeURIComponent(ids.projectName)}/${encodeURIComponent(ids.pageName)}`);
        // Wait for the page to be fully loaded and search box to be ready
        await page.waitForLoadState("networkidle");
        await page.waitForSelector(".page-search-box input", { state: "visible" });
    });

    test("dropdown only visible when input is focused", async ({ page }) => {
        // Ensure search box input is visible and ready
        const searchInput = page.locator(".page-search-box input");
        await expect(searchInput).toBeVisible();

        // Focus the input first to ensure it's ready for interaction
        await searchInput.focus();
        await page.waitForTimeout(100);

        // Type the search query
        await searchInput.fill("another-page"); // Search for the page name that was created

        // Wait for search results to appear
        const dropdown = page.locator(".page-search-box ul");
        await expect(dropdown).toBeVisible({ timeout: 10000 });

        // Clear the input and click outside the search input to hide the dropdown
        await searchInput.clear();
        await page.locator("body").click(); // Click on body to ensure we're outside the search box
        await expect(dropdown).not.toBeVisible();
    });
});
