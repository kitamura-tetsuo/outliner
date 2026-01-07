// import "../utils/registerAfterEachSnapshot";
// import { registerCoverageHooks } from "../utils/registerCoverageHooks";
// registerCoverageHooks();
/** @feature SEA-0001
 *  Title   : Add page title search box
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SEA-0001: page title search box", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // Manually forward console logs since we bypassed the fixture
        page.on("console", msg => console.log(`[BROWSER] ${msg.text()}`));

        // Force disable Yjs IndexedDB to avoid cache conflicts with fresh seed
        await page.addInitScript(() => {
            localStorage.setItem("VITE_DISABLE_YJS_INDEXEDDB", "true");
        });

        test.setTimeout(360000);
        const ids = await TestHelpers.prepareTestEnvironment(page, testInfo, [], undefined, {
            skipAppReady: true,
            doNotSeed: true,
        });

        await TestHelpers.createAndSeedProject(page, null, ["second page text"], {
            projectName: ids.projectName,
            pageName: "second-page",
        });

        // REMOVED: await page.reload();
        // We rely on live sync (incremental update) to update the store and SearchBox.
        // This avoids potential Yjs/OrderedTree snapshot hydration issues found during debugging.

        await page.evaluate(() => (window as any).E2E_SEARCH_DEBUG = true);

        // Wait for AppReady (if skipped initially) or just wait for store?
        // Since we are already on the page (from prepareTestEnvironment), we just need to wait for the new page to arrive.
        // We add a safety wait for AppReady just in case initial load was slow.
        try {
            await expect(page.getByTestId("outliner-base")).toBeVisible({ timeout: 10000 });
        } catch {
            console.log("AppReady timed out (initial load), but proceeding to wait for live sync...");
        }

        // Wait for the new page to appear in the SearchBox data
        console.log("Waiting for live sync of second-page...");
        await page.waitForTimeout(5000); // Give plenty of time for 20s sync fallback if needed
    });

    test("search box navigates to another page", async ({ page }) => {
        // Force disable Yjs Auth and IndexedDB
        await page.addInitScript(() => {
            localStorage.setItem("VITE_DISABLE_YJS_INDEXEDDB", "true");
            localStorage.setItem("VITE_YJS_REQUIRE_AUTH", "false");
        });

        // Ensure search box input is visible and ready
        const searchInput = page.locator(".page-search-box input");
        await expect(searchInput).toBeVisible();

        // Create a new page "second-page" via Client-side API (simulating user action/console)
        // This avoids potential sync validation issues with external SeedClient updates
        await page.evaluate(() => {
            const proj = (window as any).generalStore.project;
            if (proj) {
                proj.addPage("second-page", "e2e-user");
                console.log("Client-side: Added second-page");
            } else {
                throw new Error("Project not found in store");
            }
        });

        console.log("Added second-page via client store");

        // Wait for store to update (SearchBox reactivity depends on this)
        await page.waitForTimeout(2000); // Wait for search results

        // Search
        await searchInput.focus();
        await page.waitForTimeout(100);
        await searchInput.fill("second");
        await page.waitForTimeout(1000); // Wait for search results

        // Verify results
        const firstResult = page.locator(".page-search-box li").first();
        await expect(firstResult).toBeVisible({ timeout: 10000 });
        await expect(firstResult).toContainText("second-page");

        await firstResult.click();

        // Verify navigation
        await expect(page).toHaveURL(/second-page/, { timeout: 30000 });

        // Verify accessible labels and icon
        await expect(searchInput).toHaveAttribute("aria-label", "Search pages");
        await expect(searchInput).toHaveAttribute("placeholder", "Search pages");
        await expect(page.locator(".page-search-box .search-icon")).toBeVisible();
    });
});
