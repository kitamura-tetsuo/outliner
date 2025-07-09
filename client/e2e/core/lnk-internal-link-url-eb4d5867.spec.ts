/** @feature LNK-0002
 *  Title   : 内部リンクの機能検証
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "../fixtures/console-forward";
import { TestHelpers } from "../utils/testHelpers";

test.describe("LNK-0002: 内部リンクURL生成", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "[simple-page]",
            "[/project/page]",
            "[/multi/level/path/page]",
        ]);
    });

    test("内部リンクのURLが正しく生成される", async ({ page }) => {
        const links = await page.locator("a.internal-link").all();
        const hrefs = [] as string[];
        for (const link of links) {
            const href = await link.getAttribute("href");
            hrefs.push(href || "");
        }

        expect(hrefs).toContain("/simple-page");
        expect(hrefs).toContain("/project/page");
        expect(hrefs).toContain("/multi/level/path/page");
    });
});
