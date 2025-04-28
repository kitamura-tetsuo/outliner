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
        // 編集モードに入る
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click({ force: true });
        // 隠し textarea にフォーカスが当たるまで待機
        await page.waitForSelector("textarea.hidden-textarea:focus");
    });

    test("ArrowLeftキーでカーソルが1文字左に移動する", async ({ page }) => {
        const cursor = page.locator(".editor-overlay .cursor.active");
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
