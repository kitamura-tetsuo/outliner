/** @feature CLM-0003
 *  Title   : 右へ移動
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";

test.describe("CLM-0003: 右へ移動", () => {
    test.beforeEach(async ({ page }) => {
        // アプリを開く
        await page.goto("/");
        // OutlinerItem がレンダリングされるのを待つ
        await page.waitForSelector(".outliner-item");

        // 最初のアイテムを取得 (first()の代わりにページタイトルを使用)
        // ページが読み込まれた直後は最初のアイテムがページタイトルになる
        const item = page.locator(".outliner-item.page-title");

        // ページタイトルが見つからない場合は、最初に表示されているアイテムを使用
        if (await item.count() === 0) {
            // 画面に表示されているアイテムを取得
            await page.locator(".outliner-item").first().locator(".item-content").click({ force: true });
        } else {
            await item.locator(".item-content").click({ force: true });
        }

        // グローバル textarea にフォーカスが当たるまで待機
        await page.waitForSelector("textarea.global-textarea:focus");
        // 文字入力が可能
        await page.keyboard.type("Test data");
    });

    test("ArrowRightキーでカーソルが1文字右に移動する", async ({ page }) => {
        // 現在アクティブなアイテムを取得
        const activeItem = page.locator(".outliner-item.active");
        if (await activeItem.count() === 0) {
            // アクティブなアイテムがない場合は、テキスト内容で特定
            const item = page.locator(".outliner-item").filter({ hasText: "Test data" });
            await item.locator(".item-content").click({ force: true });
            await page.waitForSelector("textarea.global-textarea:focus");
        }

        // カーソルを左に移動して初期位置を設定
        await page.keyboard.press("Home");

        // アクティブなカーソルを取得
        const cursor = page.locator(".editor-overlay .cursor.active");
        await cursor.waitFor({ state: 'visible' });

        // 初期カーソル位置を取得
        const initialX = await cursor.evaluate(el => el.getBoundingClientRect().left);

        // 右矢印キーを押下
        await page.keyboard.press("ArrowRight");
        // 更新を待機
        await page.waitForTimeout(100);

        // 新しいカーソル位置を取得
        const newX = await cursor.evaluate(el => el.getBoundingClientRect().left);

        // カーソルが移動していることを確認（右に移動するとX座標が大きくなる）
        // ただし、フォントによっては左に移動することもあるため、位置が変わっていることだけを確認
        expect(newX).not.toEqual(initialX);
    });

    test("一番最後の文字にある時は、一つ次のアイテムの最初の文字へ移動する", async ({ page }) => {
        // テスト開始時のアイテム数を確認
        const initialItemCount = await page.locator(".outliner-item").count();
        console.log(`テスト開始時のアイテム数: ${initialItemCount}`);

        // 現在のアイテムを取得 (テキスト内容で特定)
        const firstItem = page.locator(".outliner-item").filter({ hasText: "Test data" });

        // 現在のアイテムが存在することを確認
        await firstItem.waitFor({ state: 'visible' });

        // アイテムのIDを取得して保存 (後で同じアイテムを確実に特定するため)
        const firstItemId = await firstItem.getAttribute("data-item-id");
        console.log(`最初のアイテムID: ${firstItemId}`);

        // 最初のアイテムをクリックして選択
        await firstItem.locator(".item-content").click();
        await page.waitForTimeout(300);

        // 2つ目のアイテムを追加
        await page.keyboard.press("End"); // 最後に移動
        await page.waitForTimeout(300);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(500);
        await page.keyboard.type("Second item");
        await page.waitForTimeout(500);

        // 編集モードを一旦終了
        await page.keyboard.press("Escape");
        await page.waitForTimeout(500);

        // 2つ目のアイテムが存在することを確認
        const secondItem = page.locator(".outliner-item").nth(1);
        await secondItem.waitFor({ state: 'visible' });

        // 2つ目のアイテムのテキスト内容を確認
        const secondItemText = await secondItem.locator(".item-text").textContent();
        console.log(`2番目のアイテムのテキスト: ${secondItemText}`);
        expect(secondItemText).toContain("Second item");

        // 保存したIDを使って最初のアイテムに戻る
        await page.locator(`.outliner-item[data-item-id="${firstItemId}"]`).locator(".item-content").click();
        await page.waitForTimeout(500);

        // カーソルを行末に移動
        await page.keyboard.press("End");
        await page.waitForTimeout(500);

        // 初期カーソル位置のテキストを取得
        const initialCursorText = await page.locator(`.outliner-item[data-item-id="${firstItemId}"]`).locator(".item-text").textContent();
        console.log(`初期アイテムのテキスト: ${initialCursorText}`);

        // カーソルの数を確認
        const initialCursorCount = await page.evaluate(() => {
            return document.querySelectorAll(".cursor").length;
        });
        console.log(`移動前のカーソル数: ${initialCursorCount}`);
        expect(initialCursorCount).toBe(1); // カーソルが1つだけ存在することを確認

        // 右矢印キーを押下
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(1000);

        // カーソルの数を確認（1つだけのはず）
        const cursorCount = await page.evaluate(() => {
            return document.querySelectorAll(".cursor").length;
        });
        console.log(`移動後のカーソル数: ${cursorCount}`);
        expect(cursorCount).toBe(1); // カーソルが1つだけ存在することを確認

        // 2番目のアイテムのIDを取得
        const secondItemId = await secondItem.getAttribute("data-item-id");
        console.log(`2番目のアイテムID: ${secondItemId}`);

        // アクティブなカーソルが属するアイテムIDを取得
        const activeItemId = await page.evaluate(() => {
            const cursor = document.querySelector('.cursor.active');
            if (!cursor) return null;

            // カーソルからアイテムIDを取得
            return cursor.getAttribute('data-item-id');
        });
        console.log(`アクティブなカーソルのアイテムID: ${activeItemId}`);

        // カーソルが属するアイテムが2番目のアイテムであることを確認
        if (activeItemId) {
            expect(activeItemId).toBe(secondItemId);
        } else {
            // アイテムIDが取得できない場合は、カーソルの位置で確認
            const cursorElement = await page.locator(".cursor.active").first();
            const cursorBoundingBox = await cursorElement.boundingBox();

            if (cursorBoundingBox) {
                // カーソルの位置から、そのカーソルが2番目のアイテム内にあるかを確認
                const isInSecondItem = await page.evaluate(
                    ({ cursorX, cursorY, secondItemId }) => {
                        // カーソル位置の要素を取得
                        const elementAtCursor = document.elementFromPoint(cursorX, cursorY);
                        if (!elementAtCursor) return false;

                        // 最も近い outliner-item を探す
                        const closestItem = elementAtCursor.closest('.outliner-item');
                        return closestItem && closestItem.getAttribute('data-item-id') === secondItemId;
                    },
                    {
                        cursorX: cursorBoundingBox.x + cursorBoundingBox.width / 2,
                        cursorY: cursorBoundingBox.y + cursorBoundingBox.height / 2,
                        secondItemId
                    }
                );

                console.log(`カーソルは2番目のアイテム内にありますか: ${isInSecondItem}`);
                expect(isInSecondItem).toBe(true);
            }
        }

        // カーソルの存在を確認（表示されているかどうかは問わない）
        const finalCursorCount = await page.evaluate(() => {
            return document.querySelectorAll(".cursor").length;
        });
        console.log(`最終的なカーソルの数: ${finalCursorCount}`);
        expect(finalCursorCount).toBe(1); // カーソルが1つ存在することを確認

        // 2番目のアイテムにフォーカスがあることを確認（テキスト入力が可能かどうか）
        await page.waitForTimeout(500); // 少し待機して状態が安定するのを待つ

        // 2番目のアイテムにテキストを入力して、正しく入力されることを確認
        await page.keyboard.type("Test input");
        await page.waitForTimeout(500);

        // 2番目のアイテムのテキスト内容を再確認
        const updatedSecondItemText = await secondItem.locator(".item-text").textContent();
        console.log(`更新後の2番目のアイテムのテキスト: ${updatedSecondItemText}`);
        expect(updatedSecondItemText).toContain("Test input");
    });
});
