import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { expect, test } from "../fixtures/console-forward";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

test.describe("SEA-0001: page title search box", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(360000);
        // Prepare the main test environment, which creates a project and a default page
        const { projectName } = await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "main page content",
        ]);

        // Seed the second page that we will search for
        await TestHelpers.createAndSeedProject(page, testInfo, ["second page text"], {
            projectName,
            pageName: "second-page",
        });

        // Wait for the newly created page to be available in the client's store
        await page.waitForFunction(() => {
            const gs = (window as any).generalStore;
            const pages = gs?.project?.items;
            if (!pages) return false;
            // Y.Array needs to be converted to a JS array to use .some()
            const pageArray = Array.from(pages as any);
            return pageArray.some((p: any) => (p.text?.toString() ?? "").toLowerCase() === "second-page");
        }, { timeout: 30000 });
    });

    test("search box navigates to another page", async ({ page }) => {
        // Ensure search box input is visible and ready
        const searchInput = page.locator(".page-search-box input");
        await expect(searchInput).toBeVisible();

        // Type the search query
        await searchInput.focus();
        await searchInput.fill("second");

        // Wait for search results to appear
        const firstResult = page.locator(".page-search-box li").first();
        await expect(firstResult).toBeVisible({ timeout: 20000 });
        await expect(firstResult).toContainText("second-page");

        // Navigate using keyboard
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");

        // Verify navigation
        await expect(page).toHaveURL(/second-page/, { timeout: 30000 });
    });
});
