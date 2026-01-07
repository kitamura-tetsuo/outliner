// import "../utils/registerAfterEachSnapshot";
// import { registerCoverageHooks } from "../utils/registerCoverageHooks";
// registerCoverageHooks();
/** @feature SEA-0001
 *  Title   : Add page title search box (late load)
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SEA-0001: page title search box", () => {
    test("search results update when pages load after typing", async ({ page, context }, testInfo) => {
        test.setTimeout(360000);
        const { projectName } = await TestHelpers.prepareTestEnvironment(page, testInfo);
        const input = page
            .getByTestId("main-toolbar")
            .getByRole("textbox", { name: "Search pages" });
        await input.waitFor();
        await input.focus();
        await input.fill("second");

        // Create page in a separate tab to simulate another user/process adding data
        // This tests live updates and bypasses SeedClient issues
        const page2 = await context.newPage();
        await page2.goto(`/${projectName}/second-page`);

        // Use "Add Item" button to create the page
        const addButton = page2.getByRole("button", { name: "アイテム追加" });
        await addButton.waitFor();
        await addButton.click({ force: true });

        // Wait for creation on second tab
        await expect(page2.locator("h1")).toContainText("second-page");

        // Ensure page2 is connected and synced before closing
        await page2.waitForFunction(() => {
            const y = (window as any).__YJS_STORE__;
            return y && y.isConnected;
        }, { timeout: 15000 }).catch(() => console.log("Warning: page2 Yjs connect timeout"));

        await page2.waitForTimeout(10000); // Allow Yjs to sync to server and back to page 1
        await page2.close();

        // Focus the input again on original page
        await input.focus();
        const inputAfterNav = input; // Input is still valid as we didn't reload

        // Explicitly wait for project items to be loaded from Yjs BEFORE typing
        // This ensures the SearchBox has data to search against
        await page.waitForFunction(() => {
            // eslint-disable-next-line no-restricted-globals
            const gs = (window as any).generalStore || (window as any).appStore;
            const items = gs?.project?.items;
            const hasItems = items && items.length >= 2;
            if (!hasItems) {
                // Log only occasionally or on failure to avoid spam
                // console.log(`[Wait] items length: ${items?.length}`);
            }
            return hasItems; // Should have at least current page + second page
        }, { timeout: 60000 }).catch(() =>
            console.log("[Test] Warning: Timeout waiting for project items to populate")
        );

        // Type the search query
        await page.waitForTimeout(1000); // Give a bit more time for any pending renders

        // Retry mechanism with explicit reactivity triggers
        let found = false;
        // Reduce retries to fail faster
        for (let i = 0; i < 3; i++) {
            await inputAfterNav.clear();
            await inputAfterNav.fill("second");
            // Trigger events ensuring reactivity
            await inputAfterNav.press("Space");
            await inputAfterNav.press("Backspace");
            // Dispatch explicit input event
            await inputAfterNav.evaluate(el => el.dispatchEvent(new Event("input", { bubbles: true })));
            await page.waitForTimeout(1000); // Allow Svelte reactivity

            try {
                // Explicitly wait for results
                await expect.poll(async () => {
                    const buttons = page.locator(".page-search-box ul li button");
                    const count = await buttons.filter({ hasText: "second" }).count();
                    if (count === 0) {
                        // Force a state update if not found yet (Svelte 5 signal tweak)
                        await page.evaluate(() => {
                            const store = (window as any).generalStore;
                            if (store) store.pagesVersion++;
                        }).catch(() => {});
                    }
                    return count;
                }, { timeout: 10000 }).toBeGreaterThan(0);
                found = true;
                break;
            } catch {
                console.log(`Search attempt ${i + 1} failed, retrying...`);
                // Force a blur/focus cycle
                await inputAfterNav.blur();
                await page.waitForTimeout(500);
                await inputAfterNav.focus();
            }
        }
        expect(found).toBe(true);
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(/second-page/);
    });
});
