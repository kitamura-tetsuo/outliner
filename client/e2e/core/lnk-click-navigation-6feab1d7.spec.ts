import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature LNK-0003
 *  Title   : 内部リンクのナビゲーション機能
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("LNK-0003: 内部リンクのナビゲーション機能", () => {
    let projectName: string;

    test.beforeEach(async ({ page }, testInfo) => {
        // Create a page with an internal link pointing to another page
        const result = await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "[target-page]",
            "別のアイテム",
            "3つ目のアイテム",
        ]);
        projectName = result.projectName;
    });

    test("内部リンクをクリックして遷移先のページ内容が正しく表示される", async ({ page }) => {
        await page.waitForTimeout(500);

        // Create the target page that the internal link points to
        await TestHelpers.createAndSeedProject(page, null, ["This is the target page"], {
            projectName,
            pageName: "target-page",
        });

        // Find the internal link
        const encodedProject = encodeURIComponent(projectName);
        const internalLink = page.locator(`a.internal-link[href="/${encodedProject}/target-page"]`);

        // Verify the link exists
        await expect(internalLink).toHaveCount(1);

        // Verify link properties
        const href = await internalLink.getAttribute("href");
        expect(href).toBe(`/${encodedProject}/target-page`);

        const text = await internalLink.textContent();
        expect(text).toBe("target-page");

        // Click the link
        await internalLink.click();

        // Verify navigation to target page URL
        await expect(page).toHaveURL(new RegExp(`/${encodedProject}/target-page`));

        // Navigate back to source page to verify content
        await TestHelpers.navigateToProjectPage(page, projectName, "target-page");

        // Verify the target page loaded with correct title
        const pageTitle = page.locator(".page-title-content .item-text");
        await expect(pageTitle).toBeVisible({ timeout: 10000 });
        await expect(pageTitle).toContainText("target-page");
    });
});
