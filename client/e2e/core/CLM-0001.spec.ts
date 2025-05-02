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
        // ページタイトルを優先的に使用（最初に表示されるアイテム）
        const item = page.locator(".outliner-item.page-title");

        // ページタイトルが見つからない場合は、表示されている最初のアイテムを使用
        if (await item.count() === 0) {
            // テキスト内容で特定できるアイテムを探す
            const visibleItems = page.locator(".outliner-item").filter({ hasText: /.*/ });
            await visibleItems.first().locator(".item-content").click({ force: true });
        } else {
            await item.locator(".item-content").click({ force: true });
        }

        // 隠し textarea がフォーカスされているか確認
        const isFocused = await page.evaluate(() => {
            const active = document.activeElement;
            return active?.classList.contains("global-textarea");
        });
        expect(isFocused).toBe(true);

        // 編集クラスが付与されているか確認
        // 現在アクティブなアイテムを取得
        const activeItem = page.locator(".outliner-item .item-content.editing");
        expect(await activeItem.count()).toBe(1);
    });

    test("編集モードで文字入力が可能", async ({ page }) => {
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

        // 文字入力が可能
        await page.keyboard.type("Test data update");

        // 文字入力が反映されているか確認
        // 現在編集中のアイテムを取得
        const activeItem = page.locator(".outliner-item .item-content.editing");
        const text = await activeItem.locator(".item-text").textContent();
        expect(text).toContain("Test data update");
    });

    test("カーソルが表示される", async ({ page }) => {
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

        // 編集モードに入るまで待機
        await page.waitForSelector("textarea.global-textarea:focus");

        // カーソル要素がDOMに追加されるまで待機
        await page.waitForSelector(".editor-overlay .cursor.active", { state: "attached" });

        // カーソルが可視であることを確認
        const visible = await page.isVisible(".editor-overlay .cursor.active");
        expect(visible).toBe(true);
    });

    test("カーソルがクリック位置に表示される（最後の行を除く）", async ({ page }) => {
        // ページタイトルを優先的に使用
        const item = page.locator(".outliner-item.page-title");
        let testItem: any;

        // ページタイトルが見つからない場合は、表示されている最初のアイテムを使用
        if (await item.count() === 0) {
            // テキスト内容で特定できるアイテムを探す
            const visibleItems = page.locator(".outliner-item").filter({ hasText: /.*/ });
            testItem = visibleItems.first();
        } else {
            testItem = item;
        }

        // 折り返しが発生する長いテキストを入力
        await testItem.locator(".item-content").click({ force: true });
        const longText = "A".repeat(80);
        await page.locator(".global-textarea").fill(longText);
        await page.locator(".global-textarea").dispatchEvent("input");
        await page.waitForTimeout(100);

        // テキストが反映されているか確認
        // 現在編集中のアイテムを取得
        const activeItem = page.locator(".outliner-item .item-content.editing");
        const text = await activeItem.locator(".item-text").textContent();
        expect(text).toContain("A".repeat(80));

        // アイテムのIDを取得して保存（後で同じアイテムを確実に特定するため）
        const itemId = await activeItem.evaluate(el => {
            const parent = el.closest('.outliner-item');
            return parent ? parent.getAttribute('data-item-id') : null;
        });

        // Range APIでビジュアル上の各行の中央y座標を取得
        const visualLineYs = await activeItem.locator(".item-text").evaluate(el => {
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

        // 最後の行を除いた各ビジュアル行中央をクリックしてカーソル位置を検証
        // 最後の行は行末のカーソル位置が特殊なため除外する
        for (const y of visualLineYs.slice(0, -1)) {
            // IDを使って同じアイテムを確実に取得
            const targetItem = page.locator(`.outliner-item[data-item-id="${itemId}"]`);
            const rect = await targetItem.locator(".item-content").evaluate(el => el.getBoundingClientRect());
            const x = rect.left + rect.width / 2;

            await page.keyboard.press("Escape");
            await targetItem.locator(".item-content").click();
            await page.mouse.click(x, y);
            await page.waitForSelector(".editor-overlay .cursor.active", { state: "attached" });

            // 複数のカーソルがある場合は最初のものを使用
            const cursor = page.locator(".editor-overlay .cursor.active").first();
            const cursorBox = await cursor.boundingBox();

            expect(cursorBox).not.toBeNull();

            // x/y座標がクリック位置付近であること
            // 最後の行は除外しているので、適切な許容範囲で検証できる
            expect(Math.abs(cursorBox!.x - x)).toBeLessThan(20);
            expect(Math.abs(cursorBox!.y - y)).toBeLessThan(20);
        }
    });

    test("最後の行のテキスト外クリックでカーソルが行末に表示される", async ({ page }) => {
        // ページタイトルを優先的に使用
        const item = page.locator(".outliner-item.page-title");
        let testItem: any;

        // ページタイトルが見つからない場合は、表示されている最初のアイテムを使用
        if (await item.count() === 0) {
            // テキスト内容で特定できるアイテムを探す
            const visibleItems = page.locator(".outliner-item").filter({ hasText: /.*/ });
            testItem = visibleItems.first();
        } else {
            testItem = item;
        }

        // 折り返しが発生する長いテキストを入力
        await testItem.locator(".item-content").click({ force: true });
        const longText = "A".repeat(80);
        await page.locator(".global-textarea").fill(longText);
        await page.locator(".global-textarea").dispatchEvent("input");
        await page.waitForTimeout(100);

        // テキストが反映されているか確認
        // 現在編集中のアイテムを取得
        const activeItem = page.locator(".outliner-item .item-content.editing");
        const text = await activeItem.locator(".item-text").textContent();
        expect(text).toContain("A".repeat(80));

        // アイテムのIDを取得して保存（後で同じアイテムを確実に特定するため）
        const itemId = await activeItem.evaluate(el => {
            const parent = el.closest('.outliner-item');
            return parent ? parent.getAttribute('data-item-id') : null;
        });

        // Range APIでビジュアル上の各行の中央y座標を取得
        const visualLineYs = await activeItem.locator(".item-text").evaluate(el => {
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

        // 最後の行のy座標を取得
        const lastLineY = visualLineYs[visualLineYs.length - 1];

        // IDを使って同じアイテムを確実に取得
        const targetItem = page.locator(`.outliner-item[data-item-id="${itemId}"]`);
        const rect = await targetItem.locator(".item-content").evaluate(el => el.getBoundingClientRect());

        // テキスト右端より右側の位置をクリック
        const x = rect.left + rect.width - 10; // 右端近くの位置

        await page.keyboard.press("Escape");
        await targetItem.locator(".item-content").click();
        await page.mouse.click(x, lastLineY);
        await page.waitForSelector(".editor-overlay .cursor.active", { state: "attached" });

        // 複数のカーソルがある場合は最初のものを使用
        const cursor = page.locator(".editor-overlay .cursor.active").first();
        const cursorBox = await cursor.boundingBox();

        expect(cursorBox).not.toBeNull();

        // カーソル位置がテキストの末尾にあることを確認
        // テキストエリアの選択位置を取得
        const cursorPosition = await page.evaluate(() => {
            const textarea = document.querySelector('.global-textarea') as HTMLTextAreaElement;
            return textarea ? textarea.selectionStart : -1;
        });

        // カーソル位置がテキストの長さと一致することを確認
        expect(cursorPosition).toBe(longText.length);
    });

    test("カーソルが点滅する", async ({ page }) => {
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

        // 編集モードに入るまで待機
        await page.waitForSelector("textarea.global-textarea:focus");

        // カーソル要素がDOMに追加されるまで待機
        await page.waitForSelector(".editor-overlay .cursor.active", { state: "attached" });

        // 複数のカーソルがある場合は最初のものを使用
        const cursor = page.locator(".editor-overlay .cursor.active").first();
        const initialOpacity = await cursor.evaluate(el => window.getComputedStyle(el).opacity);

        // 次の点滅状態まで待機
        await page.waitForTimeout(600);
        const nextOpacity = await cursor.evaluate(el => window.getComputedStyle(el).opacity);
        expect(initialOpacity).not.toBe(nextOpacity);
    });
});
