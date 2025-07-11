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

    test("存在しないページへの内部リンクをクリックした場合の挙動", async ({ page }) => {
        await page.goto("http://localhost:7090/unknown-page");
        await page.waitForSelector(".outliner-item", { timeout: 10000 });
        console.log("Navigated to new page");
    });
});
