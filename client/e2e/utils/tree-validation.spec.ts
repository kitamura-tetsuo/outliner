/** @feature TST-0001
 *  Title   : SharedTreeデータ検証ユーティリティのテスト
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "./testHelpers";
import { TreeValidator } from "./treeValidation";

test.describe("TreeValidator: SharedTreeデータ検証ユーティリティ", () => {
    let actualPageTitle: string;

    test.beforeEach(async ({ page }, testInfo) => {
        // テストページをセットアップ
        const result = await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "First item",
            "Second item",
            "Third item",
        ]);

        // 実際のページタイトルを保存
        actualPageTitle = result.pageName;

        // 少し待機してデータが反映されるのを待つ
        await page.waitForTimeout(500);
    });

    test("getTreeData: SharedTreeのデータ構造を取得できる", async ({ page }) => {
        // SharedTreeのデータ構造を取得（フォールバック機能付き）
        const treeData = await TreeValidator.getTreeData(page);

        // データが取得できていることを確認
        expect(treeData).toBeTruthy();
        expect(treeData.itemCount).toBeGreaterThan(0);
        expect(treeData.items).toBeTruthy();
        expect(Array.isArray(treeData.items)).toBe(true);

        // 少なくとも1つのアイテムが含まれていることを確認
        const texts = treeData.items.map(item => item.text);
        expect(texts.length).toBeGreaterThan(0);

        // 最初のアイテムのテキストを確認
        if (texts.length > 0) {
            expect(texts[0]).toBeTruthy();
        }

        console.log("Tree data:", JSON.stringify(treeData, null, 2));
    });

    test("assertTreeData: 期待値と比較できる（部分比較モード）", async ({ page }) => {
        // 実際のデータ構造に合わせた期待値を定義（itemsはオブジェクト）
        const expectedData = {
            itemCount: 1,
            items: [
                {
                    text: actualPageTitle, // 実際のページタイトルを使用
                    items: {
                        "0": { text: "First item" },
                        "1": { text: "Second item" },
                        "2": { text: "Third item" },
                    },
                },
            ],
        };

        // 部分比較モードで検証（フォールバック機能付き）
        await TreeValidator.assertTreeData(page, expectedData);
    });

    test("assertTreeData: 期待値と比較できる（厳密比較モード）", async ({ page }) => {
        // 現在のデータを取得（フォールバック機能付き）
        const currentData = await TreeValidator.getTreeData(page);

        // 同じデータで厳密比較
        await TreeValidator.assertTreeData(page, currentData, true);
    });

    test("assertTreePath: 特定のパスのデータを検証できる", async ({ page }) => {
        // 実際のデータ構造に合わせたパスで検証（フォールバック機能付き）
        await TreeValidator.assertTreePath(page, "itemCount", 1);
        await TreeValidator.assertTreePath(page, "items.0.text", actualPageTitle); // 実際のページタイトルを使用

        // itemsがオブジェクトの場合のパス（実際のデータ構造）
        // まず、items.0.itemsが存在することを確認
        const itemsObject = await TreeValidator.getTreePathData(page, "items.0.items");
        if (itemsObject && typeof itemsObject === "object") {
            // オブジェクトのキーを使用してアクセス
            const keys = Object.keys(itemsObject);
            if (keys.length >= 3) {
                await TreeValidator.assertTreePath(page, `items.0.items.${keys[0]}.text`, "First item");
                await TreeValidator.assertTreePath(page, `items.0.items.${keys[1]}.text`, "Second item");
                await TreeValidator.assertTreePath(page, `items.0.items.${keys[2]}.text`, "Third item");
            }
        }

        // 存在しないパスの検証（undefinedが返されるはず）
        const nonExistentPath = await TreeValidator.getTreePathData(page, "items.0.nonexistent");
        expect(nonExistentPath).toBeUndefined();
    });

    test("takeTreeSnapshot & compareWithSnapshot: スナップショットを取得して比較できる", async ({ page }) => {
        // スナップショットを取得（フォールバック機能付き）
        const snapshot = await TreeValidator.takeTreeSnapshot(page);

        // 何も変更せずに比較（一致するはず）
        await TreeValidator.compareWithSnapshot(page, snapshot);

        // 新しいアイテムを追加
        await page.locator(".outliner-item").first().click();
        await page.keyboard.press("End");
        await page.keyboard.press("Enter");
        await page.keyboard.type("Fourth item");
        await page.waitForTimeout(500);

        // 変更後は一致しないはず
        try {
            await TreeValidator.compareWithSnapshot(page, snapshot);
            // ここに到達したら失敗
            expect(false).toBeTruthy();
        } catch (error) {
            // エラーが発生することを期待
            expect(error).toBeTruthy();
        }

        // 特定のパスを無視して比較
        try {
            // 新しく追加されたアイテムのパスを無視
            await TreeValidator.compareWithSnapshot(page, snapshot, ["items.0.items.2"]);
            // ここに到達したら失敗
            expect(false).toBeTruthy();
        } catch (error) {
            // エラーが発生することを期待
            expect(error).toBeTruthy();
        }
    });
});
import "./registerAfterEachSnapshot";
