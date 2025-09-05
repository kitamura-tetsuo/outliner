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
        // navigate back to first page to ensure SearchBox appears
        await page.goto(`/${encodeURIComponent(ids.projectName)}/${encodeURIComponent(ids.pageName)}`);
    });

    test("search box navigates to another page", async ({ page }) => {
        // Ensure input is focused before typing to show dropdown reliably
        const input = page
            .getByTestId("main-toolbar")
            .getByRole("textbox", { name: "Search pages" });
        await input.waitFor();
        await input.focus();
        await input.fill("second");
        await page.waitForSelector(".page-search-box li");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(/second-page/);
    });
});
import "../utils/registerAfterEachSnapshot";
