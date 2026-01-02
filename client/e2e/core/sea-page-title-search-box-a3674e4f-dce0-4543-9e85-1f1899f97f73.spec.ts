import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SEA-0001
 *  Title   : Add page title search box
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "../fixtures/console-forward";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SEA-0001: page title search box", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        const ids = await TestHelpers.prepareTestEnvironment(page, testInfo);
        await TestHelpers.createAndSeedProject(page, null, ["second page text"], {
            projectName: ids.projectName,
            pageName: "second-page",
        });

        // Navigate to the second page and wait for it to sync, then navigate back
        // This ensures the second page is synced to the Yjs document
        await TestHelpers.navigateToProjectPage(page, ids.projectName, "second-page");

        // navigate back to first page to ensure SearchBox appears
        await TestHelpers.navigateToProjectPage(page, ids.projectName, ids.pageName);
    });

    test("search box navigates to another page", async ({ page }) => {
        // Ensure search box input is visible and ready
        const searchInput = page.locator(".page-search-box input");
        await expect(searchInput).toBeVisible();

        // Verify accessible labels and icon
        await expect(searchInput).toHaveAttribute("aria-label", "Search pages");
        await expect(searchInput).toHaveAttribute("placeholder", "Search pages");
        await expect(page.locator(".page-search-box .search-icon")).toBeVisible();

        // Focus the input first to ensure it's ready for interaction
        await searchInput.focus();
        await page.waitForTimeout(100);

        // Type the search query
        await searchInput.pressSequentially("second", { delay: 100 });
        await searchInput.blur(); // Ensure change event fires

        // Wait for the search to process and results to be computed
        // Check that the results are available in the component state
        await page.waitForFunction(() => {
            const input = document.querySelector(".page-search-box input") as HTMLInputElement;
            // Allow loose match or check if value is set
            if (!input || !input.value.includes("second")) return false;

            // Check if results are being computed
            const gs = (window as any).generalStore || (window as any).appStore;
            if (!gs?.project?.items) return false;

            // Verify that we have pages to search
            const items = gs.project.items;
            let hasSecondPage = false;
            try {
                if (typeof items[Symbol.iterator] === "function") {
                    for (const item of items) {
                        const title = item?.text?.toString?.() ?? "";
                        if (title.toLowerCase().includes("second")) {
                            hasSecondPage = true;
                            break;
                        }
                    }
                }
            } catch {}

            return hasSecondPage;
        }, { timeout: 10000 });

        // Wait for search results to appear with a more specific selector
        // The results should contain a list item with the text "second-page"
        const resultsList = page.locator(".page-search-box ul");
        // Explicitly wait for the list to be present in the DOM
        await page.waitForFunction(() => !!document.querySelector(".page-search-box ul"), { timeout: 30000 });
        await expect(resultsList).toBeVisible({ timeout: 30000 });

        // Wait for at least one list item to be present
        await page.waitForFunction(() => document.querySelectorAll(".page-search-box li").length > 0, {
            timeout: 30000,
        });
        const firstResult = page.locator(".page-search-box li").first();
        await expect(firstResult).toBeVisible({ timeout: 30000 });

        // Verify the result contains "second-page"
        await expect(firstResult).toContainText("second-page");

        // Navigate using keyboard
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");

        // Verify navigation
        await expect(page).toHaveURL(/second-page/, { timeout: 10000 });
    });
});
