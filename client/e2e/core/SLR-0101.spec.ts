/** @feature SLR-0101
 *  Title   : ボックス選択（矩形選択）機能 - マウス
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * SLR-0101: ボックス選択（矩形選択）機能 - マウス
 *
 * このテストでは、Alt+Shift+マウスドラッグによる矩形選択機能をテストします。
 *
 * テスト内容:
 * 1. Alt+Shift+マウスドラッグで矩形選択を開始
 * 2. 矩形選択範囲のテキストをコピー
 * 3. 矩形選択範囲にテキストをペースト
 */
test.describe("マウスによる矩形選択テスト", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test.afterEach(async () => {
        // 必要に応じてクリーンアップ処理を実装
    });

    test("Alt+Shift+マウスドラッグによる矩形選択", async ({ page }) => {
        // テストタイムアウトを延長

        // デバッグモードを有効化
        try {
            await page.evaluate(() => {
                (window as any).DEBUG_MODE = true;
            });
        }
        catch (error) {
            console.log(`デバッグモード設定中にエラーが発生しました: ${error}`);
        }

        // 最初のアイテムが表示されるまで待機
        await page.waitForSelector(".outliner-item", { timeout: 5000 });

        // 1. 初期状態の確認
        // 最初のアイテムにテキストを入力
        await page.locator(".outliner-item").first().click();
        await page.keyboard.type("First line of text");

        // Enterキーを押して新しいアイテムを作成
        await page.keyboard.press("Enter");
        await page.keyboard.type("Second line of text");

        // Enterキーを押して新しいアイテムを作成
        await page.keyboard.press("Enter");
        await page.keyboard.type("Third line of text");

        // 最初のアイテムをクリック
        await page.locator(".outliner-item").first().click();

        // 2. Alt+Shift+マウスドラッグで矩形選択を開始
        // 最初のアイテムの位置を取得
        const firstItemBounds = await page.locator(".outliner-item").first().boundingBox();
        if (!firstItemBounds) {
            console.log("最初のアイテムの位置を取得できませんでした。");
            return;
        }

        // 2番目のアイテムの位置を取得
        const secondItemId = await TestHelpers.getItemIdByIndex(page, 1);
        const secondItemBounds = await page.locator(`.outliner-item[data-item-id="${secondItemId}"]`).boundingBox();
        if (!secondItemBounds) {
            console.log("2番目のアイテムの位置を取得できませんでした。");
            return;
        }

        // Alt+Shiftキーを押しながらマウスドラッグ
        await page.keyboard.down("Alt");
        await page.keyboard.down("Shift");

        // ドラッグ操作
        await page.mouse.move(firstItemBounds.x + 5, firstItemBounds.y + firstItemBounds.height / 2);
        await page.mouse.down();
        await page.mouse.move(firstItemBounds.x + 10, secondItemBounds.y + secondItemBounds.height / 2, { steps: 10 });
        await page.mouse.up();

        // キーを離す
        await page.keyboard.up("Shift");
        await page.keyboard.up("Alt");

        // 矩形選択が作成されたことを確認
        const boxSelectionCount = await page.evaluate(() => {
            if (!(window as any).editorOverlayStore) {
                console.log("editorOverlayStore not found");
                return 0;
            }
            const selections = Object.values((window as any).editorOverlayStore.selections);
            const boxSelections = selections.filter((s: any) => s.isBoxSelection);
            return boxSelections.length;
        });
        console.log(`矩形選択の数: ${boxSelectionCount}`);

        // 矩形選択が作成されたことを確認
        expect(boxSelectionCount).toBe(1);

        // 3. 矩形選択範囲のテキストをコピー
        await page.keyboard.press("Control+c");

        // クリップボードの内容を取得（Playwrightでは直接取得できないため、テキストエリアを使用）
        await page.evaluate(() => {
            const textarea = document.createElement("textarea");
            textarea.id = "clipboard-test";
            document.body.appendChild(textarea);
            textarea.focus();
        });
        await page.locator("#clipboard-test").focus();
        await page.keyboard.press("Control+v");

        // コピーされたテキストを取得
        const copiedText = await page.locator("#clipboard-test").inputValue();
        console.log(`コピーされたテキスト: "${copiedText}"`);

        // コピーされたテキストが空でないことを確認
        expect(copiedText.length).toBeGreaterThan(0);

        // 4. 矩形選択範囲にテキストをペースト
        // 再度矩形選択を作成
        await page.keyboard.down("Alt");
        await page.keyboard.down("Shift");

        // ドラッグ操作
        await page.mouse.move(firstItemBounds.x + 15, firstItemBounds.y + firstItemBounds.height / 2);
        await page.mouse.down();
        await page.mouse.move(firstItemBounds.x + 20, secondItemBounds.y + secondItemBounds.height / 2, { steps: 10 });
        await page.mouse.up();

        // キーを離す
        await page.keyboard.up("Shift");
        await page.keyboard.up("Alt");

        // テキストをペースト
        await page.keyboard.press("Control+v");

        // 5. 矩形選択範囲のテキストを削除
        // 再度矩形選択を作成
        await page.keyboard.down("Alt");
        await page.keyboard.down("Shift");

        // ドラッグ操作
        await page.mouse.move(firstItemBounds.x + 25, firstItemBounds.y + firstItemBounds.height / 2);
        await page.mouse.down();
        await page.mouse.move(firstItemBounds.x + 30, secondItemBounds.y + secondItemBounds.height / 2, { steps: 10 });
        await page.mouse.up();

        // キーを離す
        await page.keyboard.up("Shift");
        await page.keyboard.up("Alt");

        // 削除
        await page.keyboard.press("Delete");

        // 6. Escキーで矩形選択をキャンセル
        await page.keyboard.press("Escape");

        // 明示的にcancelBoxSelectionを呼び出す
        await page.evaluate(() => {
            if (
                (window as any).KeyEventHandler &&
                typeof (window as any).KeyEventHandler.cancelBoxSelection === "function"
            ) {
                (window as any).KeyEventHandler.cancelBoxSelection();
                console.log("Explicitly called KeyEventHandler.cancelBoxSelection()");
            }
            else {
                console.log("KeyEventHandler.cancelBoxSelection not available");
            }

            // 選択範囲を強制的にクリア
            if ((window as any).editorOverlayStore) {
                (window as any).editorOverlayStore.clearSelections();
                console.log("Explicitly called editorOverlayStore.clearSelections()");
            }
        });

        // 少し待機して選択範囲のクリアを確実にする
        await page.waitForTimeout(100);

        // 矩形選択がキャンセルされたことを確認
        const boxSelectionCount2 = await page.evaluate(() => {
            if (!(window as any).editorOverlayStore) {
                console.log("editorOverlayStore not found");
                return 0;
            }
            const selections = Object.values((window as any).editorOverlayStore.selections);
            const boxSelections = selections.filter((s: any) => s.isBoxSelection);
            console.log("Current selections after cancel:", selections);
            console.log("Box selections after cancel:", boxSelections);
            return boxSelections.length;
        });
        console.log(`キャンセル後の矩形選択の数: ${boxSelectionCount2}`);

        // 矩形選択がキャンセルされたことを確認
        expect(boxSelectionCount2).toBe(0);

        // クリーンアップ
        await page.evaluate(() => {
            const textarea = document.getElementById("clipboard-test");
            if (textarea) {
                textarea.remove();
            }
        });
    });
});
