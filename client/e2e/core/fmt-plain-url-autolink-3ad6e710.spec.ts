import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FMT-3ad6e710
 *  Title   : Plain URL auto-link
 *  Source  : docs/client-features.yaml
 */

import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Plain URL auto-link", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo);
    });

    test("converts a bare URL in item text to a clickable link", async ({ page }) => {
        await TestHelpers.seedProjectAndNavigate(page, test.info(), [
            "Visit https://example.com for details",
        ]);

        await TestHelpers.waitForOutlinerItems(page);

        const firstItemId = await TestHelpers.getItemIdByIndex(page, 1);
        expect(firstItemId).not.toBeNull();

        const firstItemHtml = await page.locator(`.outliner-item[data-item-id="${firstItemId}"]`).locator(".item-text")
            .innerHTML();
        expect(firstItemHtml).toContain('<a href="https://example.com"');
        expect(firstItemHtml).toContain('target="_blank"');
        expect(firstItemHtml).toContain(">https://example.com</a>");
    });

    test("excludes trailing punctuation from the linked URL", async ({ page }) => {
        await TestHelpers.seedProjectAndNavigate(page, test.info(), [
            "Read https://example.com/page.",
        ]);

        await TestHelpers.waitForOutlinerItems(page);

        const firstItemId = await TestHelpers.getItemIdByIndex(page, 1);
        expect(firstItemId).not.toBeNull();

        const firstItemHtml = await page.locator(`.outliner-item[data-item-id="${firstItemId}"]`).locator(".item-text")
            .innerHTML();
        expect(firstItemHtml).toContain('<a href="https://example.com/page"');
        expect(firstItemHtml).toContain(">https://example.com/page</a>.");
    });
});
