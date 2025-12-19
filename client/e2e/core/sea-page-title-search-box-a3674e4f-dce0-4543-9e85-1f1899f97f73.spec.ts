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
        await TestHelpers.createTestPageViaAPI(page, "second-page", ["second page text"]);

        // Wait for the page to be created and available in the project
        await page.waitForFunction(() => {
            const gs = (window as any).generalStore || (window as any).appStore;
            if (!gs?.project?.items) return false;
            const items = gs.project.items;
            let count = 0;
            try {
                if (typeof items[Symbol.iterator] === "function") {
                    count = Array.from(items).length;
                } else if (typeof items.length === "number") {
                    count = items.length;
                }
            } catch {}
            // We expect at least 2 pages: the initial page and "second-page"
            return count >= 2;
        }, { timeout: 10000 });

        // navigate back to first page to ensure SearchBox appears
        await page.goto(`/${encodeURIComponent(ids.projectName)}/${encodeURIComponent(ids.pageName)}`);
        // Wait for the page to be fully loaded and search box to be ready
        // Wait for the page to be fully loaded and search box to be ready
        // networkidle is flaky with long-polling/websocket connections, so use domcontentloaded + explicit selector wait
        await page.waitForLoadState("domcontentloaded");
        await page.waitForSelector(".page-search-box input", { state: "visible", timeout: 15000 });
    });

    test("search box navigates to another page", async ({ page }) => {
        // Ensure search box input is visible and ready
        const searchInput = page.locator(".page-search-box input");
        await expect(searchInput).toBeVisible();

        // Focus the input first to ensure it's ready for interaction
        await searchInput.focus();
        await page.waitForTimeout(100);

        // Type the search query
        await searchInput.fill("second");

        // Wait for the search to process and results to be computed
        // Check that the results are available in the component state
        await page.waitForFunction(() => {
            const input = document.querySelector(".page-search-box input") as HTMLInputElement;
            if (!input || input.value !== "second") return false;

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
        await expect(resultsList).toBeVisible({ timeout: 10000 });

        // Wait for at least one list item to be present
        const firstResult = page.locator(".page-search-box li").first();
        await expect(firstResult).toBeVisible({ timeout: 10000 });

        // Verify the result contains "second-page"
        await expect(firstResult).toContainText("second-page");

        // Ensure input is focused before keyboard interaction
        await searchInput.focus();

        // Navigate using keyboard
        // 結果リストが安定するまで少し待機（レンダリングのちらつき防止）
        await page.waitForTimeout(300);
        await page.keyboard.press("ArrowDown");

        // Verify that an item is actually selected before pressing Enter
        const selectedItem = page.locator(".page-search-box li.selected");
        await expect(selectedItem).toBeVisible();

        await page.keyboard.press("Enter");

        // Verify navigation
        await expect(page).toHaveURL(/second-page/, { timeout: 10000 });
    });
});
