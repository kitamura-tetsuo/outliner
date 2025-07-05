/**
 * CursorValidator の使用例
 *
 * このファイルには、CursorValidator クラスの使用例が含まれています。
 * テストでのカーソル情報の検証方法を示しています。
 */

import { Page } from "@playwright/test";
import { setupCursorDebugger, waitForCursorVisible } from "../helpers";
import { CursorValidator } from "./cursorValidation";

/**
 * 基本的な使用例
 * @param page Playwrightのページオブジェクト
 */
export async function basicUsageExample(page: Page): Promise<void> {
    // カーソル情報取得用のデバッグ関数をセットアップ
    await setupCursorDebugger(page);

    // 最初のアイテムをクリックしてカーソルを表示
    await page.locator(".outliner-item").first().click();
    await waitForCursorVisible(page);

    // カーソル情報を取得
    const cursorData = await CursorValidator.getCursorData(page);
    console.log("Cursor data:", JSON.stringify(cursorData, null, 2));
}

/**
 * 部分比較モードでの検証例
 * @param page Playwrightのページオブジェクト
 */
export async function partialComparisonExample(page: Page): Promise<void> {
    // カーソル情報取得用のデバッグ関数をセットアップ
    await setupCursorDebugger(page);

    // 最初のアイテムをクリックしてカーソルを表示
    await page.locator(".outliner-item").first().click();
    await waitForCursorVisible(page);

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
}

/**
 * 厳密比較モードでの検証例
 * @param page Playwrightのページオブジェクト
 */
export async function strictComparisonExample(page: Page): Promise<void> {
    // カーソル情報取得用のデバッグ関数をセットアップ
    await setupCursorDebugger(page);

    // 最初のアイテムをクリックしてカーソルを表示
    await page.locator(".outliner-item").first().click();
    await waitForCursorVisible(page);

    // 現在のデータを取得
    const currentData = await CursorValidator.getCursorData(page);

    // 同じデータで厳密比較
    await CursorValidator.assertCursorData(page, currentData, true);
}

/**
 * 特定のパスのデータを検証する例
 * @param page Playwrightのページオブジェクト
 */
export async function pathValidationExample(page: Page): Promise<void> {
    // カーソル情報取得用のデバッグ関数をセットアップ
    await setupCursorDebugger(page);

    // 最初のアイテムをクリックしてカーソルを表示
    await page.locator(".outliner-item").first().click();
    await waitForCursorVisible(page);

    // カーソルの数を検証
    await CursorValidator.assertCursorPath(page, "cursorCount", 1);

    // 最初のカーソルがアクティブであることを検証
    await CursorValidator.assertCursorPath(page, "cursors.0.isActive", true);
}

/**
 * スナップショットを取得して比較する例
 * @param page Playwrightのページオブジェクト
 */
export async function snapshotComparisonExample(page: Page): Promise<void> {
    // カーソル情報取得用のデバッグ関数をセットアップ
    await setupCursorDebugger(page);

    // 最初のアイテムをクリックしてカーソルを表示
    await page.locator(".outliner-item").first().click();
    await waitForCursorVisible(page);

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
        throw new Error("スナップショットが一致してしまいました");
    } catch (error) {
        console.log("スナップショットが一致しないことを確認しました");
    }
}

/**
 * カーソル移動のテスト例
 * @param page Playwrightのページオブジェクト
 */
export async function cursorMovementExample(page: Page): Promise<void> {
    // カーソル情報取得用のデバッグ関数をセットアップ
    await setupCursorDebugger(page);

    // 最初のアイテムをクリックしてカーソルを表示
    await page.locator(".outliner-item").first().click();
    await waitForCursorVisible(page);

    // 初期状態のスナップショットを取得
    const initialSnapshot = await CursorValidator.takeCursorSnapshot(page);
    console.log("Initial cursor position:", initialSnapshot.cursors[0].offset);

    // カーソルを右に移動
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(100);

    // 移動後のカーソル情報を取得
    const afterMoveSnapshot = await CursorValidator.takeCursorSnapshot(page);
    console.log("Cursor position after move:", afterMoveSnapshot.cursors[0].offset);

    // カーソルが移動したことを確認
    expect(afterMoveSnapshot.cursors[0].offset).toBeGreaterThan(initialSnapshot.cursors[0].offset);
}
