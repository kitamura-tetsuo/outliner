/** @feature OUT-0000 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("OUT-0000: tree operations", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("ツールバーのアイテム追加ボタンで新規アイテムが追加される", async ({ page }) => {
        const items = page.locator('.outliner-item');
        const initialCount = await items.count();
        await page.click('.outliner .toolbar .actions button');
        await expect(page.locator('.outliner-item')).toHaveCount(initialCount + 1, { timeout: 7000 });
    });

    test("アイテムの作成、兄弟追加、削除が正しく機能する", async ({ page }) => {
        const items = page.locator('.outliner-item');
        const initialCount = await items.count();

        await page.click('.outliner .toolbar .actions button');
        await expect(items).toHaveCount(initialCount + 1, { timeout: 7000 });

        const newId = await TestHelpers.getItemIdByIndex(page, initialCount);
        const newItem = page.locator(`.outliner-item[data-item-id="${newId}"]`);
        await newItem.hover();
        await newItem.locator('button[title="新しいアイテムを追加"]').click();
        await expect(items).toHaveCount(initialCount + 2, { timeout: 7000 });

        const thirdId = await TestHelpers.getItemIdByIndex(page, initialCount + 1);
        const thirdItem = page.locator(`.outliner-item[data-item-id="${thirdId}"]`);
        await thirdItem.hover();
        await thirdItem.locator('button[title="削除"]').click();
        await expect(items).toHaveCount(initialCount + 1, { timeout: 7000 });
    });
});
