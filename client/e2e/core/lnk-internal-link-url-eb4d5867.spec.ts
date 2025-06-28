/** @feature LNK-0002
 *  Title   : 内部リンクの機能検証
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("LNK-0002: 内部リンクURL生成", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("内部リンクのURLが正しく生成される", async ({ page }) => {
        const uniquePageName = `link-test-${Date.now()}`;
        await TestHelpers.createTestProjectAndPageViaAPI(page, "test-project", uniquePageName, [
            "[simple-page]",
            "[/project/page]",
            "[/multi/level/path/page]",
        ]);

        await page.goto(`/test-project/${uniquePageName}`);
        await page.waitForTimeout(1000);

        await page.keyboard.press("Escape");
        await page.waitForTimeout(500);

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
