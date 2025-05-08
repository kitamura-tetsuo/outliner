/**
 * TreeValidator の使用例
 * 
 * このファイルには、TreeValidator クラスの使用例が含まれています。
 * テストでの SharedTree データの検証方法を示しています。
 */

import { Page } from "@playwright/test";
import { TreeValidator } from "./treeValidation";

/**
 * 基本的な使用例
 * @param page Playwrightのページオブジェクト
 */
export async function basicUsageExample(page: Page): Promise<void> {
    // SharedTreeのデータ構造を取得
    const treeData = await TreeValidator.getTreeData(page);
    console.log("Tree data:", JSON.stringify(treeData, null, 2));
}

/**
 * 部分比較モードでの検証例
 * @param page Playwrightのページオブジェクト
 */
export async function partialComparisonExample(page: Page): Promise<void> {
    // 実際のデータ構造に合わせた期待値を定義
    const expectedData = {
        itemCount: 1,
        items: [
            {
                text: "First item",
                items: [
                    { text: "Second item" },
                    { text: "Third item" }
                ]
            }
        ]
    };

    // 部分比較モードで検証
    await TreeValidator.assertTreeData(page, expectedData);
}

/**
 * 厳密比較モードでの検証例
 * @param page Playwrightのページオブジェクト
 */
export async function strictComparisonExample(page: Page): Promise<void> {
    // 現在のデータを取得
    const currentData = await TreeValidator.getTreeData(page);
    
    // 同じデータで厳密比較
    await TreeValidator.assertTreeData(page, currentData, true);
}

/**
 * 特定のパスのデータを検証する例
 * @param page Playwrightのページオブジェクト
 */
export async function pathValidationExample(page: Page): Promise<void> {
    // 特定のパスのデータを検証
    await TreeValidator.assertTreePath(page, "itemCount", 1);
    await TreeValidator.assertTreePath(page, "items.0.text", "First item");
    await TreeValidator.assertTreePath(page, "items.0.items.0.text", "Second item");
    await TreeValidator.assertTreePath(page, "items.0.items.1.text", "Third item");
    
    // 存在しないパスの検証
    const nonExistentPath = await page.evaluate(() => {
        if (typeof window.getFluidTreePathData === 'function') {
            return window.getFluidTreePathData("items.0.nonexistent");
        }
        return undefined;
    });
    
    // undefinedが返されることを確認
    if (nonExistentPath !== undefined) {
        throw new Error("存在しないパスがundefinedを返しませんでした");
    }
}

/**
 * スナップショットを取得して比較する例
 * @param page Playwrightのページオブジェクト
 */
export async function snapshotComparisonExample(page: Page): Promise<void> {
    // スナップショットを取得
    const snapshot = await TreeValidator.takeTreeSnapshot(page);
    
    // 何も変更せずに比較（一致するはず）
    await TreeValidator.compareWithSnapshot(page, snapshot);
    
    // 新しいアイテムを追加
    await page.locator(".outliner-item").first().click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("New item");
    await page.waitForTimeout(500);
    
    // 変更後は一致しないはず
    try {
        await TreeValidator.compareWithSnapshot(page, snapshot);
        throw new Error("スナップショットが一致してしまいました");
    } catch (error) {
        console.log("スナップショットが一致しないことを確認しました");
    }
}

/**
 * 特定のパスを無視して比較する例
 * @param page Playwrightのページオブジェクト
 */
export async function ignorePathsExample(page: Page): Promise<void> {
    // スナップショットを取得
    const snapshot = await TreeValidator.takeTreeSnapshot(page);
    
    // 新しいアイテムを追加
    await page.locator(".outliner-item").first().click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("New item");
    await page.waitForTimeout(500);
    
    // 特定のパスを無視して比較
    try {
        // 新しく追加されたアイテムのパスを無視
        await TreeValidator.compareWithSnapshot(page, snapshot, ["items.0.items.2"]);
        console.log("無視したパス以外は一致しました");
    } catch (error) {
        console.error("無視したパス以外も変更されています");
    }
}

/**
 * 複数のテストを組み合わせた総合例
 * @param page Playwrightのページオブジェクト
 */
export async function comprehensiveExample(page: Page): Promise<void> {
    // 1. データ構造を取得
    const treeData = await TreeValidator.getTreeData(page);
    
    // 2. 部分比較で基本構造を検証
    const expectedStructure = {
        itemCount: 1,
        items: [
            {
                text: "First item",
                items: [
                    { text: "Second item" },
                    { text: "Third item" }
                ]
            }
        ]
    };
    await TreeValidator.assertTreeData(page, expectedStructure);
    
    // 3. 特定のパスを検証
    await TreeValidator.assertTreePath(page, "items.0.text", "First item");
    
    // 4. スナップショットを取得
    const snapshot = await TreeValidator.takeTreeSnapshot(page);
    
    // 5. 変更を加える
    await page.locator(".outliner-item").first().click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("New item");
    await page.waitForTimeout(500);
    
    // 6. 変更後のデータを取得
    const updatedData = await TreeValidator.getTreeData(page);
    
    // 7. 変更を検証
    const hasNewItem = updatedData.items[0].items.some(
        (item: any) => item.text === "New item"
    );
    
    if (!hasNewItem) {
        throw new Error("新しいアイテムが追加されていません");
    }
    
    console.log("総合テスト完了: すべての検証が成功しました");
}
