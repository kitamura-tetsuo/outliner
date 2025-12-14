import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FMT-0008
 *  Title   : Support multiple internal links in one item
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { LinkTestHelpers } from "../utils/linkTestHelpers";
import { TestHelpers } from "../utils/testHelpers";

/**
 * @file FMT-0008.spec.ts
 * @playwright
 */

test.describe("FMT-0008: multiple internal links", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("multiple internal links are displayed", async ({ page }) => {
        // prepareTestEnvironment の lines パラメータでデータを作成
        await TestHelpers.prepareTestEnvironment(page, test.info(), [
            "This is [test-page] and [/project/other-page]",
        ]);

        // wait for formatting
        await page.waitForTimeout(500);

        // get first item (not page title)
        const firstId = await TestHelpers.getItemIdByIndex(page, 1);
        expect(firstId).not.toBeNull();

        // verify both links are present
        const itemLocator = page.locator(
            `.outliner-item[data-item-id="${firstId}"] .item-text`,
        );

        const currentUrl = page.url();
        const urlParts = new URL(currentUrl).pathname.split("/").filter(Boolean);
        const projectNameEncoded = urlParts[0];

        const html = await itemLocator.innerHTML();
        expect(html).toMatch(
            new RegExp(
                `<a href="/${projectNameEncoded}/test-page"[^>]*class="[^"]*internal-link[^"]*"[^>]*>test-page</a>`,
            ),
        );
        expect(html).toMatch(
            /<a href="\/project\/other-page"[^>]*class="[^"]*internal-link[^"]*project-link[^"]*"[^>]*>project\/other-page<\/a>/,
        );

        const firstLink = itemLocator.locator(`a[href="/${projectNameEncoded}/test-page"]`);
        const secondLink = itemLocator.locator('a[href="/project/other-page"]');
        await expect(firstLink).toHaveClass(/page-not-exists/);
        await expect(secondLink).toHaveClass(/page-not-exists/);

        await LinkTestHelpers.forceLinkPreview(page, "test-page", undefined, false);
        const preview = page.locator(".link-preview-popup");
        if ((await preview.count()) > 0) {
            await expect(preview).toBeVisible();
            await expect(preview.locator("h3")).toHaveText(/test-page/i);
        }
    });
});
