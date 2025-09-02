import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * YJS-0001: Yjsモード基本スモークテスト
 * - OutlinerBaseが表示される
 * - 「アイテム追加」ボタンが表示される
 */

test.describe("Yjs smoke", () => {
    test("Outliner renders and shows add item button (Yjs)", async ({ page }, testInfo) => {
        // 軽量スモーク: データスナップショット等は行わない
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // OutlinerBaseの表示
        const base = page.locator('[data-testid="outliner-base"]');
        await expect(base).toBeVisible({ timeout: 20000 });

        // ツールバーの表示を待機（OutlinerTreeのマウント完了を待つ）
        await page.locator('[data-testid="outliner-toolbar"]').first().waitFor({ state: "visible", timeout: 20000 });

        // アイテム追加ボタン（data-testid を使用して安定化）
        const addBtn = page.locator('[data-testid="add-item-btn"]');
        await expect(addBtn).toBeVisible({ timeout: 20000 });
    });
});
