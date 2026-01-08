import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SEA-0001
 *  Title   : Add page title search box (late load)
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "../fixtures/console-forward";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SEA-0001: page title search box", () => {
    test("search results update when pages load after typing", async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
        const input = page
            .getByTestId("main-toolbar")
            .getByRole("textbox", { name: "Search pages" });
        await input.waitFor();
        await input.focus();
        await input.fill("second");
        // Create page after user types to simulate late data availability
        await TestHelpers.createTestPageViaAPI(page, "second-page", ["second page text"]);
        await page.waitForSelector(".page-search-box li");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(/second-page/);
    });
});
