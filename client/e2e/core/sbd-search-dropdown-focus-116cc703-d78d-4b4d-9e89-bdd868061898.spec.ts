/** @feature SBD-ebaa03c1
 *  Title   : Show search dropdown only on focus
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "../fixtures/console-forward";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SBD-ebaa03c1: search dropdown visibility", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        const ids = await TestHelpers.prepareTestEnvironment(page, testInfo);
        await TestHelpers.createTestPageViaAPI(page, "another-page", ["another page text"]);
        await page.goto(`/${encodeURIComponent(ids.projectName)}/${encodeURIComponent(ids.pageName)}`);
    });

    test("dropdown only visible when input is focused", async ({ page }) => {
        const searchInput = page.locator(".page-search-box input");
        await expect(searchInput).toBeVisible();

        await searchInput.focus();
        await searchInput.fill("another");
        const dropdown = page.locator(".page-search-box ul");
        await expect(dropdown).toBeVisible();

        await page.locator(".main-content").click();
        await expect(dropdown).not.toBeVisible();
    });
});
import "../utils/registerAfterEachSnapshot";
