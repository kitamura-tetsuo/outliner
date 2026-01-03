import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SEA-0001
 *  Title   : Add page title search box
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "../fixtures/console-forward";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SEA-0001: page title search box prefers active project", () => {
    let projectName: string;
    let initialPageName: string;

    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(300000);
        const ids = await TestHelpers.prepareTestEnvironment(page, testInfo);
        projectName = ids.projectName;
        initialPageName = ids.pageName;
        await TestHelpers.createAndSeedProject(page, null, ["search target"], {
            projectName: ids.projectName,
            pageName: "second page",
        });
        // Navigate to the second page and wait for it to sync, then navigate back
        await TestHelpers.navigateToProjectPage(page, projectName, "second page", ["search target"]);
        await TestHelpers.navigateToProjectPage(page, projectName, initialPageName, []);
    });

    test("navigates using the active project title even with spaces", async ({ page }) => {
        const searchInput = page.getByTestId("main-toolbar").getByRole("textbox", { name: "Search pages" });
        await searchInput.waitFor();

        // Ensure the project items are loaded (at least 2 items: current page + search target)
        await page.waitForFunction(() => {
            // eslint-disable-next-line no-restricted-globals
            const gs = (window as any).generalStore || (window as any).appStore;
            const items = gs?.project?.items;
            if (!items) return false;
            const arr = Array.from(items as any);
            return arr.some((item: any) => {
                const text = item?.text?.toString?.() || String(item?.text ?? "");
                return text.toLowerCase().includes("second");
            });
        }, { timeout: 30000 }).catch(() => console.log("[Test] Warning: second page not found in project items store"));

        await page.waitForTimeout(2000);

        // Retry mechanism: Type and check for results, retry if not found (handling slow indexing)
        let found = false;
        // Increase retries to handle very slow indexing in CI (up to ~60s total)
        for (let i = 0; i < 6; i++) {
            await searchInput.click();
            await searchInput.press("Control+A");
            await searchInput.press("Backspace");
            await searchInput.pressSequentially("second", { delay: 100 });
            await page.waitForTimeout(1000); // Allow Svelte reactivity

            try {
                // Explicitly wait for the option to be in the DOM
                await expect.poll(async () => {
                    const buttons = page.locator(".page-search-box button");
                    return await buttons.count() > 0 && await buttons.filter({ hasText: "second page" }).count() > 0;
                }, { timeout: 10000 }).toBe(true);
                found = true;
                break;
            } catch {
                console.log(`Search attempt ${i + 1} failed, retrying...`);
                await page.waitForTimeout(1000);
            }
        }
        expect(found).toBe(true); // Fail if still not found after retries

        const option = page.getByRole("button", { name: "second page" });
        await option.click();
        const expectedPath = `/${encodeURIComponent(projectName)}/${encodeURIComponent("second page")}`;
        await expect.poll(() => page.url()).toContain(expectedPath);
    });
});
