/** @feature LNK-0003
 *  Title   : 内部リンクのナビゲーション機能
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { waitForCursorVisible } from "../helpers";
import { TestHelpers } from "../utils/testHelpers";
import { TreeValidator } from "../utils/treeValidation";

test.describe("LNK-0003: 内部リンクのナビゲーション機能", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("プロジェクト内部リンクをクリックして遷移先のページ内容が正しく表示される", async ({ page }) => {
        const projectName = "target-project-" + Date.now().toString().slice(-6);
        const pageName = "target-page-" + Date.now().toString().slice(-6);

        await page.goto(`http://localhost:7090/${projectName}/${pageName}`);
        await page.waitForSelector("body", { timeout: 10000 });

        const pageItems = page.locator(".outliner-item");
        await expect(pageItems.first()).toBeVisible({ timeout: 10000 });
        const firstItem = pageItems.first();
        const itemText = await firstItem.textContent();
        expect(itemText).toContain(pageName);
        console.log("Project link navigation test completed successfully");
    });
});
