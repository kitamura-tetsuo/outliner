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
        test.setTimeout(300000);
        const ids = await TestHelpers.prepareTestEnvironment(page, testInfo);
        await TestHelpers.createAndSeedProject(page, null, ["second page text"], {
            projectName: ids.projectName,
            pageName: "second-page",
        });

        // Navigate to the second page and wait for it to sync, then navigate back
        // This ensures the second page is synced to the Yjs document
        await TestHelpers.navigateToProjectPage(page, ids.projectName, "second-page", ["second page text"]);

        // navigate back to first page to ensure SearchBox appears
        await TestHelpers.navigateToProjectPage(page, ids.projectName, ids.pageName, []);
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
        // Ensure the project items are loaded (at least 2 items: current page + search target)
        await page.waitForFunction(
            () => {
                // eslint-disable-next-line no-restricted-globals
                const gs = (window as any).generalStore || (window as any).appStore;
                const items = gs?.project?.items;
                if (!items) return false;

                // Robust array conversion for Y.Array or regular array
                const arr = Array.from(items as any);
                return arr.some((item: any) => {
                    const text = item?.text?.toString?.() || String(item?.text ?? "");
                    return text.toLowerCase().includes("second");
                });
            },
            { timeout: 30000 },
        ).catch(() => console.log("[Test] Warning: second page not found in project items store"));

        await page.waitForTimeout(2000); // Give explicit time for indexing if any

        // Wait for search results to appear with a more specific selector
        // The results should contain a list item with the text "second-page"
        const firstResult = page.locator(".page-search-box li").first();

        // Retry mechanism
        let found = false;
        // Increase retries to handle very slow indexing in CI (up to ~60s total)
        for (let i = 0; i < 6; i++) {
            await searchInput.click();
            await searchInput.press("Control+A");
            await searchInput.press("Backspace");
            await searchInput.pressSequentially("second", { delay: 100 });

            try {
                // Robustly wait for the result
                await expect.poll(async () => {
                    const count = await page.locator(".page-search-box li").count();
                    if (count === 0) return false;
                    return await firstResult.isVisible();
                }, { timeout: 10000 }).toBe(true);
                found = true;
                break;
            } catch {
                console.log(`Search attempt ${i + 1} failed, retrying...`);
                await page.waitForTimeout(1000);
            }
        }
        expect(found).toBe(true);

        // Verify the result contains "second-page"
        await expect(firstResult).toContainText("second-page");

        // Navigate using keyboard
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");

        // Verify navigation
        await expect(page).toHaveURL(/second-page/, { timeout: 30000 });
    });
});
