import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("LNK-SAME-PROJECT: Internal link navigation inside same project", () => {
    let projectName: string;

    test.beforeEach(async ({ page }, testInfo) => {
        const result = await TestHelpers.seedProjectAndNavigate(page, testInfo, [
            "[target-page]",
            "Another item",
        ]);
        projectName = result.projectName;
    });

    test("Clicking an internal link to same project correctly remounts outliner", async ({ page }) => {
        await page.waitForTimeout(500);

        await TestHelpers.seedProjectDataOnly(page, null, ["Target Page item content"], {
            projectName,
            pageName: "target-page",
        });

        const encodedProject = encodeURIComponent(projectName);
        const internalLink = page.locator(`a.internal-link[href="/${encodedProject}/target-page"]`);

        await expect(internalLink).toHaveCount(1);
        await internalLink.click();

        await expect(page).toHaveURL(new RegExp(`/${encodedProject}/target-page`));

        await TestHelpers.waitForOutlinerItems(page, 2, 30000);

        // Let's assert the contents of the tree
        const pageTitle = page.locator(".page-title-content .item-text");
        await expect(pageTitle).toContainText("target-page", { timeout: 10000 });

        // Exclude the page title by finding the second outliner item.
        const firstItem = page.locator(".outliner-item[data-item-id] .item-text").nth(1);
        await expect(firstItem).toBeVisible({ timeout: 10000 });
        await expect(firstItem).toContainText("Target Page item content", { timeout: 10000 });
    });
});
