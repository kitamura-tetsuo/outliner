import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
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
        await page.waitForSelector("a.internal-link", { timeout: 10000 });
        const links = await page.locator("a.internal-link").all();
        const hrefs = [] as string[];
        for (const link of links) {
            const href = await link.getAttribute("href");
            hrefs.push(href || "");
        }

        const currentUrl = page.url();
        const urlParts = new URL(currentUrl).pathname.split("/").filter(Boolean);
        const projectNameEncoded = urlParts[0];

        expect(hrefs).toContain(`/${projectNameEncoded}/simple-page`);
        expect(hrefs).toContain("/project/page");
        expect(hrefs).toContain("/multi/level/path/page");
    });
});
