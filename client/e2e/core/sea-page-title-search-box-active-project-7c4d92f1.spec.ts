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
        const ids = await TestHelpers.prepareTestEnvironment(page, testInfo);
        projectName = ids.projectName;
        initialPageName = ids.pageName;
        await TestHelpers.createTestPageViaAPI(page, "second page", ["search target"]);
        await page.goto(`/${encodeURIComponent(projectName)}/${encodeURIComponent(initialPageName)}`);
    });

    test("navigates using the active project title even with spaces", async ({ page }) => {
        const searchInput = page.getByTestId("main-toolbar").getByRole("textbox", { name: "Search pages" });
        await searchInput.waitFor();
        await searchInput.fill("second");
        // Wait for results to be present and stable
        await page.waitForSelector('button:has-text("second page")', { timeout: 15000 });
        await page.waitForTimeout(1000);
        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(500);
        await page.keyboard.press("Enter");

        await expect.poll(() => {
            const path = new URL(page.url()).pathname;
            const decoded = decodeURIComponent(path).replace(/\+/g, " ");
            return decoded;
        }, { timeout: 20000 }).toContain(`/${projectName}/second page`);
    });
});
