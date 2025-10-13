import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature LNK-0002
 *  Title   : 内部リンクの機能検証
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { waitForCursorVisible } from "../helpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("LNK-0002: 内部リンクの基本機能", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "[test-page]",
            "別のアイテム",
            "3つ目のアイテム",
        ]);
    });

    test("内部リンクが正しく機能する", async ({ page }) => {
        await page.waitForTimeout(500);
        const internalLink = page.locator('a.internal-link[href="/test-page"]');
        await expect(internalLink).toHaveCount(1);

        const target = await internalLink.getAttribute("target");
        expect(target).toBeNull();

        const className = await internalLink.getAttribute("class");
        expect(className).toContain("internal-link");

        const text = await internalLink.textContent();
        expect(text).toBe("test-page");
    });
});
