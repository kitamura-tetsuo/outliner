/** @feature CLM-0002
 *  Title   : 左へ移動
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";

test.describe("CLM-0002: 左へ移動", () => {
    test.beforeEach(async ({ page }) => {
        // // 認証状態をモック
        // await page.addInitScript(() => {
        //     window.localStorage.setItem("authenticated", "true");
        // });
        // アプリを開く
        await page.goto("/");
        // OutlinerItem がレンダリングされるのを待つ
        await page.waitForSelector(".outliner-item");

        // ページタイトルを優先的に使用
        const item = page.locator(".outliner-item.page-title");

        // ページタイトルが見つからない場合は、表示されている最初のアイテムを使用
        if (await item.count() === 0) {
            // テキスト内容で特定できるアイテムを探す
            const visibleItems = page.locator(".outliner-item").filter({ hasText: /.*/ });
            await visibleItems.first().locator(".item-content").click({ force: true });
        } else {
            await item.locator(".item-content").click({ force: true });
        }

        // 隠し textarea にフォーカスが当たるまで待機
        await page.waitForSelector("textarea.global-textarea:focus");
        // 文字入力が可能
        await page.keyboard.type("Test data update");
    });

    test("ArrowLeftキーでカーソルが1文字左に移動する", async ({ page }) => {
        // 現在アクティブなアイテムを取得
        const activeItem = page.locator(".outliner-item .item-content.editing");
        await activeItem.waitFor({ state: 'visible' });

        // 複数のカーソルがある場合は最初のものを使用
        const cursor = page.locator(".editor-overlay .cursor.active").first();
        await cursor.waitFor({ state: 'visible' });

        // 初期カーソル位置を取得
        const initialX = await cursor.evaluate(el => el.getBoundingClientRect().left);

        // 左矢印キーを押下
        await page.keyboard.press("ArrowLeft");
        // 更新を待機
        await page.waitForTimeout(100);

        // 新しいカーソル位置を取得
        const newX = await cursor.evaluate(el => el.getBoundingClientRect().left);
        expect(newX).toBeLessThan(initialX);
    });
});
