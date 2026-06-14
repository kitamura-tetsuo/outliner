import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FMT-c93d46f2
 *  Title   : Label-first URL links
 *  Source  : docs/client-features.yaml
 */

import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Label-first URL links", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo);
    });

    test("converts [label URL] to link with label text", async ({ page }) => {
        await TestHelpers.seedProjectAndNavigate(page, test.info(), [
            "Please see [Example Site https://example.com]",
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

    test("supports multi-word labels before the URL", async ({ page }) => {
        await TestHelpers.seedProjectAndNavigate(page, test.info(), [
            "Source code is at [Yjs on GitHub https://github.com/yjs/yjs]",
        ]);

        await TestHelpers.waitForOutlinerItems(page);

        const firstItemId = await TestHelpers.getItemIdByIndex(page, 1);
        expect(firstItemId).not.toBeNull();

        const firstItemHtml = await page.locator(`.outliner-item[data-item-id="${firstItemId}"]`).locator(".item-text")
            .innerHTML();
        expect(firstItemHtml).toContain('<a href="https://github.com/yjs/yjs"');
        expect(firstItemHtml).toContain(">Yjs on GitHub</a>");
        expect(firstItemHtml).not.toContain('class="internal-link');
    });
});
