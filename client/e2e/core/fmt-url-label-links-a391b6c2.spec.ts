import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FMT-a391b6c2
 *  Title   : URL label links
 *  Source  : docs/client-features.yaml
 */

import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("URL label links", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("converts [URL label] to link with label text", async ({ page }) => {
        // prepareTestEnvironment の lines パラメータでデータを作成
        await TestHelpers.prepareTestEnvironment(page, test.info(), [
            "Please see [https://example.com Example Site]",
        ]);

        await page.waitForTimeout(500);

        const firstItemId = await TestHelpers.getItemIdByIndex(page, 1);
        expect(firstItemId).not.toBeNull();

        const firstItemHtml = await page.locator(`.outliner-item[data-item-id="${firstItemId}"]`).locator(".item-text")
            .innerHTML();
        expect(firstItemHtml).toContain('<a href="https://example.com"');
        expect(firstItemHtml).toContain(">Example Site</a>");
        expect(firstItemHtml).not.toContain(">https://example.com</a>");
    });
});
