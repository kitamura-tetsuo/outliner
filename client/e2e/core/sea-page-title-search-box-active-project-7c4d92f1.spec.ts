import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { expect, test } from "../fixtures/console-forward";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

test.describe("SEA-0001: page title search box prefers active project", () => {
    let projectName: string;

    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(360000);
        // Prepare environment (creates Project and Page 1)
        const ids = await TestHelpers.prepareTestEnvironment(page, testInfo, ["Page 1 content"]);
        projectName = ids.projectName;

        // Seed Page 2 via API
        await TestHelpers.createAndSeedProject(page, testInfo, ["search target"], {
            projectName: projectName,
            pageName: "Page2",
        });

        // Navigate back to the original page to ensure our context for searching is correct
        await TestHelpers.navigateToProjectPage(page, projectName, ids.pageName);
    });

    test("navigates using the active project title even with spaces", async ({ page }) => {
        const searchInput = page.getByTestId("main-toolbar").getByRole("textbox", { name: "Search pages" });
        await expect(searchInput).toBeVisible();

        // Wait for the search service to be aware of both pages
        await page.waitForFunction(() => {
            const gs = (window as any).generalStore;
            const pages = gs?.project?.items;
            return pages && (pages.length >= 2 || Array.from(pages as any).length >= 2);
        }, { timeout: 30000 });

        // Type the search query
        await searchInput.fill("Page2");

        // Wait for the search result and click it
        const option = page.getByRole("button", { name: "Page2" });
        await expect(option).toBeVisible({ timeout: 20000 });
        await option.click();

        // Verify the URL after navigation
        const expectedPath = `/${encodeURIComponent(projectName)}/${encodeURIComponent("Page2")}`;
        await expect(page).toHaveURL(new RegExp(expectedPath), { timeout: 30000 });
    });
});
