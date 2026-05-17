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
        await TestHelpers.seedProjectAndNavigate(page, testInfo);
    });

    test("converts [URL label] to link with label text", async ({ page }) => {
        // Create data using the lines parameter of prepareTestEnvironment
        await TestHelpers.seedProjectAndNavigate(page, test.info(), [
            "Please see [https://example.com Example Site]",
        ]);

        await TestHelpers.waitForOutlinerItems(page);

        const firstItemId = await TestHelpers.getItemIdByIndex(page, 1);
        expect(firstItemId).not.toBeNull();

        const firstItemHtml = await page.locator(`.outliner-item[data-item-id="${firstItemId}"]`).locator(".item-text")
            .innerHTML();
        expect(firstItemHtml).toContain('<a href="https://example.com"');
        expect(firstItemHtml).toContain(">Example Site</a>");
        expect(firstItemHtml).not.toContain(">https://example.com</a>");
    });
});
