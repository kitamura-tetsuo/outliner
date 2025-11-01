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

test.describe("LNK-0002: プロジェクト内部リンク", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "[/project-name/page-name]",
            "別のアイテム",
            "3つ目のアイテム",
        ]);
    });

    test("プロジェクト内部リンクが正しく機能する", async ({ page }) => {
        await page.waitForTimeout(500);
        const projectLink = page.locator('a.internal-link.project-link[href="/project-name/page-name"]');
        await expect(projectLink).toHaveCount(1);

        const target = await projectLink.getAttribute("target");
        expect(target).toBeNull();

        const className = await projectLink.getAttribute("class");
        expect(className).toContain("internal-link");
        expect(className).toContain("project-link");

        const text = await projectLink.textContent();
        expect(text).toBe("project-name/page-name");
    });
});
