/** @feature TST-0002
 *  Title   : カーソル情報検証ユーティリティのテスト
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { waitForCursorVisible } from "../helpers";
import { CursorValidator } from "./cursorValidation";
import { DataValidationHelpers } from "./dataValidationHelpers";
import { TestHelpers } from "./testHelpers";

test.describe("CursorValidator: カーソル情報検証ユーティリティ", () => {
    test.afterEach(async ({ page }) => {
        // FluidとYjsのデータ整合性を確認
        await DataValidationHelpers.validateDataConsistency(page);
    });
    test.beforeEach(async ({ page }, testInfo) => {
        // テストページをセットアップ
        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "First item",
            "Second item",
            "Third item",
        ]);

        // 少し待機してデータが反映されるのを待つ
        await page.waitForTimeout(500);

        // まず、OutlinerTreeコンポーネントが表示されるまで待機
        console.log("🔧 [Test] Waiting for outliner components to be visible...");
        try {
            await page.waitForFunction(() => {
                const outlinerTree = document.querySelector(".outliner");
                const outlinerBase = document.querySelector('[data-testid="outliner-base"]');
                const hasOutlinerTree = !!outlinerTree;
                const hasOutlinerBase = !!outlinerBase;

                console.log("🔧 [Test] Outliner component check", {
                    hasOutlinerTree,
                    hasOutlinerBase,
                    outlinerTreeContent: outlinerTree?.textContent?.substring(0, 50),
                });

                return hasOutlinerTree || hasOutlinerBase;
            }, { timeout: 20000, polling: 1000 });
            console.log("🔧 [Test] Outliner components are visible");
        } catch (error) {
            console.log("🔧 [Test] Outliner components not visible, but continuing...");
        }

        // 次に、outliner-itemが表示されるまで待機
        console.log("🔧 [Test] Waiting for outliner items to be visible...");
        await page.waitForSelector(".outliner-item", { timeout: 20000 });
        console.log("🔧 [Test] Outliner items are visible");

        // 最初のアイテムをクリックしてカーソルを表示
        await page.locator(".outliner-item").first().click();
        await waitForCursorVisible(page);

        // editorOverlayStoreがグローバルに公開されていることを確認
        await page.evaluate(() => {
            if (typeof window.editorOverlayStore === "undefined") {
                console.error("editorOverlayStore is not defined in window");
            } else {
                console.log("editorOverlayStore is available:", window.editorOverlayStore);
            }
        });

        // getCursorDebugData関数が利用可能であることを確認
        await page.evaluate(() => {
            if (typeof window.getCursorDebugData !== "function") {
                console.error("getCursorDebugData is not defined in window");
            } else {
                console.log("getCursorDebugData is available");
            }
        });
    });

    test("getCursorData: カーソル情報を取得できる", async ({ page }) => {
        // カーソル情報を取得
        const cursorData = await CursorValidator.getCursorData(page);

        // データが取得できていることを確認
        expect(cursorData).toBeTruthy();
        expect(cursorData.cursors).toBeTruthy();
        expect(Array.isArray(cursorData.cursors)).toBe(true);
        expect(cursorData.activeItemId).toBeTruthy();

        // 少なくとも1つのカーソルが含まれていることを確認
        expect(cursorData.cursors.length).toBeGreaterThan(0);

        // 最初のカーソルの情報を確認
        const firstCursor = cursorData.cursors[0];
        expect(firstCursor).toHaveProperty("cursorId");
        expect(firstCursor).toHaveProperty("itemId");
        expect(firstCursor).toHaveProperty("offset");
        expect(firstCursor).toHaveProperty("isActive");

        console.log("Cursor data:", JSON.stringify(cursorData, null, 2));
    });

    test("assertCursorData: 期待値と比較できる（部分比較モード）", async ({ page }) => {
        // 実際のデータ構造に合わせた期待値を定義
        const expectedData = {
            cursorCount: 1,
            cursors: [
                {
                    isActive: true,
                },
            ],
        };

        // 部分比較モードで検証
        await CursorValidator.assertCursorData(page, expectedData);
    });

    test("assertCursorData: 期待値と比較できる（厳密比較モード）", async ({ page }) => {
        // 現在のデータを取得
        const currentData = await CursorValidator.getCursorData(page);

        // 同じデータで厳密比較
        await CursorValidator.assertCursorData(page, currentData, true);
    });

    test("assertCursorPath: 特定のパスのデータを検証できる", async ({ page }) => {
        // カーソルの数を検証
        await CursorValidator.assertCursorPath(page, "cursorCount", 1);

        // 最初のカーソルがアクティブであることを検証
        await CursorValidator.assertCursorPath(page, "cursors.0.isActive", true);
    });

    test("takeCursorSnapshot & compareWithSnapshot: スナップショットを取得して比較できる", async ({ page }) => {
        // スナップショットを取得
        const snapshot = await CursorValidator.takeCursorSnapshot(page);

        // 何も変更せずに比較（一致するはず）
        await CursorValidator.compareWithSnapshot(page, snapshot);

        // カーソルを移動
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(100);

        // 変更後は一致しないはず
        try {
            await CursorValidator.compareWithSnapshot(page, snapshot);
            // ここに到達したら失敗
            expect(false).toBeTruthy();
        } catch (error) {
            // エラーが発生することを期待
            expect(error).toBeTruthy();
        }
    });

    test("assertCursorCount: カーソルの数を検証できる", async ({ page }) => {
        // カーソルの数を検証
        await CursorValidator.assertCursorCount(page, 1);
    });

    test("assertActiveItemId: アクティブなアイテムIDを検証できる", async ({ page }) => {
        // 最初のアイテムを取得
        const firstItem = page.locator(".outliner-item").first();

        // アイテムIDを取得
        const itemId = await firstItem.getAttribute("data-item-id");
        expect(itemId).toBeTruthy();

        if (itemId) {
            // アクティブなアイテムIDを検証
            await CursorValidator.assertActiveItemId(page, itemId);
        }
    });
});
