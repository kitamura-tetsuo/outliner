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
        test.setTimeout(360000);
        const ids = await TestHelpers.prepareTestEnvironment(page, testInfo);
        await TestHelpers.createAndSeedProject(page, null, ["second page text"], {
            projectName: ids.projectName,
            pageName: "second-page",
        });

        // Reload to ensure the second page is synced to the Yjs document
        await page.reload();
        await TestHelpers.waitForAppReady(page);
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

        // Explicitly wait for project items to be loaded from Yjs BEFORE typing
        // This ensures the SearchBox has data to search against
        // Check for project items (which indicates search service/indexing should be ready)
        await page.waitForFunction(() => {
            // eslint-disable-next-line no-restricted-globals
            const gs = (window as any).generalStore;
            const items = gs?.project?.items;
            return items && items.length >= 2;
        }, { timeout: 30000 }).catch(() => console.log("Warning: Items not loaded within timeout"));
        console.log("Items populated check complete.");

        // Type the search query
        // Ensure the project items are loaded (at least 2 items: current page + search target)
        await page.waitForTimeout(500);

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
                // Debug log if needed
                // console.log("Items available for search:", arr.length);
                return arr.some((item: any) => {
                    const text = item?.text?.toString?.() || String(item?.text ?? "");
                    return text.toLowerCase().includes("second");
                });
            },
            { timeout: 30000 },
        ).catch(async () => {
            console.log("[Test] Warning: second page not found in project items store");
            // Dump state for debugging
            await page.evaluate(() => {
                // eslint-disable-next-line no-restricted-globals
                const gs = (window as any).generalStore;
                console.log("Current Project Items:", gs?.project?.items);
            });
        });

        await page.waitForTimeout(2000); // Give explicit time for indexing if any

        // Wait for search results to appear with a more specific selector
        // The results should contain a list item with the text "second-page"
        const firstResult = page.locator(".page-search-box li").first();

        // Retry mechanism
        let found = false;
        // Increase retries to handle very slow indexing in CI (up to ~60s total)
        for (let i = 0; i < 6; i++) {
            await searchInput.clear();
            await searchInput.fill("second");
            // Trigger events ensuring reactivity
            await searchInput.press("Space");
            await searchInput.press("Backspace");

            // Dispatch explicit input event to ensure Svelte store updates
            await searchInput.evaluate(el => el.dispatchEvent(new Event("input", { bubbles: true })));

            try {
                // Robustly wait for the result
                await expect.poll(async () => {
                    const count = await page.locator(".page-search-box li").count();
                    // Just check for count > 0 first to ensure list is populated
                    if (count === 0) return false;
                    // Then check if the specific item is visible
                    return await firstResult.isVisible();
                }, { timeout: 10000 }).toBe(true);
                found = true;
                break;
            } catch {
                console.log(`Search attempt ${i + 1} failed, retrying...`);
                // Force a blur/focus cycle to re-trigger potential state updates
                await searchInput.blur();
                await page.waitForTimeout(500);
                await searchInput.focus();
                await page.waitForTimeout(500);
            }
        }

        // Final fallback: Reload page if search completely fails (sometimes fixes stale index)
        if (!found) {
            console.log("Search failed after retries. Attempting page reload...");
            await page.reload();
            await page.waitForTimeout(2000);
            await searchInput.fill("second");
            await searchInput.press("Enter");
            await page.waitForTimeout(2000);
            // Check one last time
            if (await firstResult.isVisible()) found = true;
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
