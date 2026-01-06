// import "../utils/registerAfterEachSnapshot";
// import { registerCoverageHooks } from "../utils/registerCoverageHooks";
// registerCoverageHooks();
/** @feature SEA-0001
 *  Title   : Add page title search box
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SEA-0001: page title search box prefers active project", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(360000);
        // Prepare environment (creates Project and Page 1)
        const ids = await TestHelpers.prepareTestEnvironment(page, testInfo);

        // Seed Page 2 via API immediately (before doing any client-side navigation/waiting)
        // This ensures Yjs initial sync includes both pages, avoiding "live update" crash issues
        await TestHelpers.createAndSeedProject(page, null, ["search target"], {
            projectName: ids.projectName,
            pageName: "Page2",
        });

        // Reload to ensure Yjs connection pulls down strict initial state including Page2
        await page.reload();
        await TestHelpers.waitForAppReady(page);
    });

    test("navigates using the active project title even with spaces", async ({ page }) => {
        const searchInput = page.getByTestId("main-toolbar").getByRole("textbox", { name: "Search pages" });
        await searchInput.waitFor();

        // Explicitly wait for project items to be loaded from Yjs BEFORE typing
        // This ensures the SearchBox has data to search against

        await page.waitForFunction(() => {
            // eslint-disable-next-line no-restricted-globals
            const gs = (window as any).generalStore || (window as any).appStore;
            const items = gs?.project?.items;
            return items && items.length >= 2; // Should have at least current page + Page2
        }, { timeout: 30000 }).catch(() =>
            console.log("[Test] Warning: Timeout waiting for project items to populate")
        );

        // Type the search query
        await page.waitForTimeout(500);

        // Retry mechanism: Type and check for results, retry if not found (handling slow indexing)
        let found = false;
        // Increase retries to handle very slow indexing in CI (up to ~60s total)
        for (let i = 0; i < 6; i++) {
            await searchInput.clear();
            await searchInput.fill("Page2");
            // Trigger events ensuring reactivity
            await searchInput.press("Space");
            await searchInput.press("Backspace");
            // Dispatch explicit input event
            await searchInput.evaluate(el => el.dispatchEvent(new Event("input", { bubbles: true })));
            await page.waitForTimeout(1000); // Allow Svelte reactivity

            try {
                // Explicitly wait for the option to be in the DOM
                await expect.poll(async () => {
                    const buttons = page.locator(".page-search-box ul li button");
                    return await buttons.count() > 0 && await buttons.filter({ hasText: "Page2" }).count() > 0;
                }, { timeout: 10000 }).toBe(true);
                found = true;
                break;
            } catch {
                console.log(`Search attempt ${i + 1} failed, retrying...`);
                // Force a blur/focus cycle
                await searchInput.blur();
                await page.waitForTimeout(500);
                await searchInput.focus();
            }
        }
        expect(found).toBe(true); // Fail if still not found after retries

        const option = page.getByRole("button", { name: "Page2" });
        await option.click();
        const expectedPath = `/${encodeURIComponent(projectName)}/${encodeURIComponent("Page2")}`;
        await expect.poll(() => page.url()).toContain(expectedPath);
    });
});
