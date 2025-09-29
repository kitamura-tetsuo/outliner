/** @feature SEA-0001
 *  Title   : Add page title search box
 *  Source  : docs/client-features.yaml
 */
import "../utils/registerAfterEachSnapshot";
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
        const option = page.getByRole("button", { name: "second page" });
        await option.waitFor();
        await option.click();
        const expectedPath = `/${encodeURIComponent(projectName)}/${encodeURIComponent("second page")}`;
        await expect.poll(() => page.url()).toContain(expectedPath);
    });
});
