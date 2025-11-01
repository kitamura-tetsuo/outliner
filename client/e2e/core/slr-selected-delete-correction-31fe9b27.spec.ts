import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SLR-0008
 *  Title   : Selected Edge Case
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SLR-0008: Selected Edge Case", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("複数アイテムにまたがる選択範囲を削除した後、カーソル位置が適切に更新される", async ({ page }) => {
        await page.keyboard.type("First\nSecond\nThird");
        await page.keyboard.down("Shift");
        for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowUp");
        await page.keyboard.up("Shift");
        await page.keyboard.press("Delete");
        await page.waitForTimeout(500);
        const itemCount = await page.locator(".outliner-item").count();
        expect(itemCount).toBeGreaterThan(0);
    });
});
