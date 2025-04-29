/** @feature CLM-0001
 *  Title   : クリックで編集モードに入る
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";

test.describe("CLM-0001: クリックで編集モードに入る", () => {
    test.beforeEach(async ({ page }) => {
        // // 認証状態をモック
        // await page.addInitScript(() => {
        //     window.localStorage.setItem("authenticated", "true");
        // });
        // アプリを開く
        await page.goto("/");
        // OutlinerItem がレンダリングされるのを待つ
        await page.waitForSelector(".outliner-item");
    });

    test("非Altクリックで編集モードに入る", async ({ page }) => {
        const item = page.locator(".outliner-item").first();
        // 非Altクリック
        await item.locator(".item-content").click({ force: true });
        // 隠し textarea がフォーカスされているか確認
        const isFocused = await page.evaluate(() => {
            const active = document.activeElement;
            return active?.classList.contains("global-textarea");
        });
        expect(isFocused).toBe(true);
        // 編集クラスが付与されているか確認
        const hasEditing = await item.locator(".item-content").evaluate(el => el.classList.contains("editing"));
        expect(hasEditing).toBe(true);
    });

    test("編集モードで文字入力が可能", async ({ page }) => {
        const item = page.locator(".outliner-item").first();
        // 非Altクリック
        await item.locator(".item-content").click({ force: true });
        // 文字入力が可能
        await page.keyboard.type("Test data update");
        // 文字入力が反映されているか確認
        const text = await item.locator(".item-text").textContent();
        expect(text).toContain("Test data update");
    });

    test("カーソルが表示される", async ({ page }) => {
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click({ force: true });
        // 編集モードに入るまで待機
        await page.waitForSelector("textarea.global-textarea:focus");
        // カーソル要素がDOMに追加されるまで待機
        await page.waitForSelector(".editor-overlay .cursor.active", { state: "attached" });
        // カーソルが可視であることを確認
        const visible = await page.isVisible(".editor-overlay .cursor.active");
        expect(visible).toBe(true);
    });

    test("カーソルがクリック位置に表示される", async ({ page }) => {
        const item = page.locator(".outliner-item").first();
        // 折り返しが発生する長いテキストを入力
        await item.locator(".item-content").click({ force: true });
        const longText = "A".repeat(80);
        await page.locator(".global-textarea").fill(longText);
        await page.locator(".global-textarea").dispatchEvent("input");
        await page.waitForTimeout(100);
        // テキストが反映されているか確認
        const text = await item.locator(".item-text").textContent();
        expect(text).toContain("A".repeat(80));

        // Range APIでビジュアル上の各行の中央y座標を取得
        const visualLineYs = await item.locator(".item-text").evaluate(el => {
            const rects = [] as { top: number; bottom: number; y: number; }[];
            const node = el.firstChild;
            if (!node) return [];
            const range = document.createRange();
            const text = (node.textContent ?? "") as string;
            const len = text.length;
            let lastBottom = -1;
            for (let i = 0; i <= len; i++) {
                range.setStart(node, i);
                range.setEnd(node, i);
                const rect = range.getBoundingClientRect();
                if (rect.height > 0 && rect.bottom !== lastBottom) {
                    rects.push({ top: rect.top, bottom: rect.bottom, y: rect.top + rect.height / 2 });
                    lastBottom = rect.bottom;
                }
            }
            return rects.map(r => r.y);
        });

        // 各ビジュアル行中央をクリックしてカーソル位置を検証
        for (const y of visualLineYs) {
            const rect = await item.locator(".item-content").evaluate(el => el.getBoundingClientRect());
            const x = rect.left + rect.width / 2;
            await page.keyboard.press("Escape");
            await item.locator(".item-content").click();
            await page.mouse.click(x, y);
            await page.waitForSelector(".editor-overlay .cursor.active", { state: "attached" });
            const cursorBox = await page.locator(".editor-overlay .cursor.active").boundingBox();
            expect(cursorBox).not.toBeNull();
            // x/y座標がクリック位置付近であること
            expect(Math.abs(cursorBox!.x - x)).toBeLessThan(20);
            expect(Math.abs(cursorBox!.y - y)).toBeLessThan(20);
        }
    });

    test("カーソルが点滅する", async ({ page }) => {
        const item = page.locator(".outliner-item").first();
        await item.locator(".item-content").click({ force: true });
        // 編集モードに入るまで待機
        await page.waitForSelector("textarea.global-textarea:focus");
        // カーソル要素がDOMに追加されるまで待機
        await page.waitForSelector(".editor-overlay .cursor.active", { state: "attached" });
        const cursor = page.locator(".editor-overlay .cursor.active");
        const initialOpacity = await cursor.evaluate(el => window.getComputedStyle(el).opacity);
        // 次の点滅状態まで待機
        await page.waitForTimeout(600);
        const nextOpacity = await cursor.evaluate(el => window.getComputedStyle(el).opacity);
        expect(initialOpacity).not.toBe(nextOpacity);
    });
});
