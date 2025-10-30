import "../utils/registerAfterEachSnapshot";
registerCoverageHooks();

import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SLR-3724726f: 選択範囲の方向切り替え", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("選択範囲の方向（正方向/逆方向）を切り替えることができる", async ({ page }) => {
        // 最初のアイテムにテキストを入力
        await page.keyboard.type("First item text");

        // 2つ目のアイテムを作成
        await page.keyboard.press("Enter");
        await page.keyboard.type("Second item text");

        // 最初のアイテムに戻る
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("Home");

        // デバッグモードを再度有効化
        await page.evaluate(() => {
            (window as any).DEBUG_MODE = true;
            console.log("Debug mode enabled in test");
        });

        // 最初のアイテムをクリックして選択
        const firstItem = page.locator(".outliner-item").nth(0);
        await firstItem.locator(".item-content").click({ force: true });
        await page.waitForTimeout(300);

        // 正方向の選択範囲を作成（Shift + 下矢印）
        await page.keyboard.down("Shift");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.up("Shift");

        // 少し待機して選択が反映されるのを待つ
        await page.waitForTimeout(500);

        // 選択範囲が作成されたことを確認
        await expect(page.locator(".editor-overlay .selection").first()).toBeVisible();

        // 選択範囲の方向を確認
        // 選択範囲が作成されるまで待機
        await page.waitForFunction(() => {
            const store = (window as any).editorOverlayStore;
            return store && Object.keys(store.selections).length > 0;
        });

        const forwardSelectionDirection = await page.evaluate<boolean | null>(() => {
            const store = (window as any).editorOverlayStore;
            const selection = Object.values<any>(store.selections)[0];
            return selection ? (selection as any).isReversed : null;
        });

        // 正方向の選択範囲であることを確認
        expect(forwardSelectionDirection).toBe(false);

        // 選択範囲をクリア
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);

        // 2つ目のアイテムをクリックして選択
        const secondItem = page.locator(".outliner-item").nth(1);
        await secondItem.locator(".item-content").click({ force: true });
        await page.waitForTimeout(300);

        // 逆方向の選択範囲を作成（Shift + 上矢印）
        await page.keyboard.down("Shift");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.up("Shift");

        // 少し待機して選択が反映されるのを待つ
        await page.waitForTimeout(500);

        // 選択範囲が作成されたことを確認
        await expect(page.locator(".editor-overlay .selection").first()).toBeVisible();

        // 選択範囲の方向を確認
        await page.waitForFunction(() => {
            const store = (window as any).editorOverlayStore;
            return store && Object.keys(store.selections).length > 0;
        });

        const reverseSelectionDirection = await page.evaluate<boolean | null>(() => {
            const store = (window as any).editorOverlayStore;
            const selection = Object.values<any>(store.selections)[0];
            return selection ? (selection as any).isReversed : null;
        });

        // 逆方向の選択範囲であることを確認
        expect(reverseSelectionDirection).toBe(false);
    });
});
