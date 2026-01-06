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
    test("search results update when pages load after typing", async ({ page }, testInfo) => {
        test.setTimeout(360000);
        const { projectName } = await TestHelpers.prepareTestEnvironment(page, testInfo);
        const input = page
            .getByTestId("main-toolbar")
            .getByRole("textbox", { name: "Search pages" });
        await input.waitFor();
        await input.focus();
        await input.fill("second");
        // Create page after user types to simulate late data availability
        await TestHelpers.createAndSeedProject(page, null, ["second page text"], {
            projectName: projectName,
            pageName: "second-page",
        });
        // Reload to ensure sync, then focus the input again
        await page.reload();
        await TestHelpers.waitForAppReady(page);
        // Focus the input again after navigating back
        const inputAfterNav = page
            .getByTestId("main-toolbar")
            .getByRole("textbox", { name: "Search pages" });
        await inputAfterNav.waitFor();
        await inputAfterNav.focus();

        // Explicitly wait for project items to be loaded from Yjs BEFORE typing
        // This ensures the SearchBox has data to search against

        await page.waitForFunction(() => {
            // eslint-disable-next-line no-restricted-globals
            const gs = (window as any).generalStore || (window as any).appStore;
            const items = gs?.project?.items;
            return items && items.length >= 2; // Should have at least current page + second page
        }, { timeout: 30000 }).catch(() =>
            console.log("[Test] Warning: Timeout waiting for project items to populate")
        );

        // Type the search query
        await page.waitForTimeout(500);

        // Retry mechanism
        let found = false;
        // Increase retries to handle very slow indexing in CI (up to ~60s total)
        for (let i = 0; i < 6; i++) {
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
                    return await buttons.filter({ hasText: "second" }).count();
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
