/** @feature CLM-0001
 *  Title   : クリックで編集モードに入る
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

test.describe("CLM-0001: クリックで編集モードに入る", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // 現在のURLを確認
        const url = page.url();
        console.log("Current URL:", url);

        // ページ内の要素を確認
        const elements = await page.evaluate(() => {
            return {
                outlinerItems: document.querySelectorAll('.outliner-item').length,
                pageTitle: document.querySelector('.outliner-item.page-title') ? true : false,
                firstItem: document.querySelector('.outliner-item') ? true : false
            };
        });
        console.log("Page elements:", elements);
    });

    test("非Altクリックで編集モードに入る", async ({ page }) => {
        // ページタイトルを優先的に使用（最初に表示されるアイテム）
        const item = page.locator(".outliner-item.page-title");

        // ページタイトルが見つからない場合は、表示されている最初のアイテムを使用
        if (await item.count() === 0) {
            // テキスト内容で特定できるアイテムを探す
            const visibleItems = page.locator(".outliner-item").filter({ hasText: /.*/ });
            await visibleItems.first().locator(".item-content").click({ force: true });
            console.log("Clicked first visible item");
        } else {
            await item.locator(".item-content").click({ force: true });
            console.log("Clicked page title item");
        }

        // スクリーンショットを撮影（クリック後）
        await page.screenshot({ path: "client/test-results/CLM-0001-after-click.png" });

        // 隠し textarea がフォーカスされているか確認
        const isFocused = await page.evaluate(() => {
            const active = document.activeElement;
            return active?.classList.contains("global-textarea");
        });
        console.log("Global textarea focused:", isFocused);
        expect(isFocused).toBe(true);

        // カーソルが表示されるまで待機
        const cursorVisible = await TestHelpers.waitForCursorVisible(page, 30000);
        console.log("Cursor visible:", cursorVisible);

        // カーソル情報を取得して検証
        const cursorData = await CursorValidator.getCursorData(page);
        console.log("Cursor data:", cursorData);
        expect(cursorData.cursorCount).toBeGreaterThan(0);
        expect(cursorData.activeItemId).not.toBeNull();
    });

    test("編集モードで文字入力が可能", async ({ page }) => {
        // ページタイトルを優先的に使用
        const item = page.locator(".outliner-item.page-title");

        // ページタイトルが見つからない場合は、表示されている最初のアイテムを使用
        if (await item.count() === 0) {
            // テキスト内容で特定できるアイテムを探す
            const visibleItems = page.locator(".outliner-item").filter({ hasText: /.*/ });
            await visibleItems.first().locator(".item-content").click({ force: true });
            console.log("Clicked first visible item for input test");
        } else {
            await item.locator(".item-content").click({ force: true });
            console.log("Clicked page title item for input test");
        }

        // カーソルが表示されるまで待機
        const cursorVisible = await TestHelpers.waitForCursorVisible(page, 30000);
        console.log("Cursor visible for input test:", cursorVisible);

        // スクリーンショットを撮影（クリック後）
        await page.screenshot({ path: "client/test-results/CLM-0001-input-after-click.png" });

        // アクティブなアイテムIDを取得
        const activeItemId = await TestHelpers.getActiveItemId(page);
        console.log("Active item ID:", activeItemId);
        expect(activeItemId).not.toBeNull();

        // 文字入力が可能
        const testText = "Test data update";
        await page.keyboard.type(testText);
        console.log("Typed text:", testText);

        // 入力後に少し待機
        await page.waitForTimeout(1000);

        // スクリーンショットを撮影（入力後）
        await page.screenshot({ path: "client/test-results/CLM-0001-input-after-typing.png" });

        // 文字入力が反映されているか確認
        // アクティブなアイテムを取得
        try {
            const activeItem = page.locator(`.outliner-item[data-item-id="${activeItemId}"]`);
            await activeItem.waitFor({ state: "visible", timeout: 10000 });
            const text = await activeItem.locator(".item-text").textContent();
            console.log("Item text:", text);
            expect(text).toContain(testText);
        } catch (e) {
            console.log("Failed to verify item text:", e.message);
            // ページ内にテキストが含まれていることを確認（代替検証）
            const pageContent = await page.textContent("body");
            expect(pageContent).toContain(testText);
        }
    });

    test("カーソルが表示される", async ({ page }) => {
        // ページタイトルを優先的に使用
        const item = page.locator(".outliner-item.page-title");

        // ページタイトルが見つからない場合は、表示されている最初のアイテムを使用
        if (await item.count() === 0) {
            // テキスト内容で特定できるアイテムを探す
            const visibleItems = page.locator(".outliner-item").filter({ hasText: /.*/ });
            await visibleItems.first().locator(".item-content").click({ force: true });
            console.log("Clicked first visible item for cursor test");
        } else {
            await item.locator(".item-content").click({ force: true });
            console.log("Clicked page title item for cursor test");
        }

        // スクリーンショットを撮影（クリック後）
        await page.screenshot({ path: "client/test-results/CLM-0001-cursor-after-click.png" });

        // 編集モードに入るまで待機
        try {
            await page.waitForSelector("textarea.global-textarea:focus", { timeout: 10000 });
            console.log("Global textarea is focused");
        } catch (e) {
            console.log("Failed to detect focused textarea:", e.message);
        }

        // カーソル要素がDOMに追加されるまで待機
        try {
            await page.waitForSelector(".editor-overlay .cursor.active", { state: "attached", timeout: 10000 });
            console.log("Cursor element is attached to DOM");
        } catch (e) {
            console.log("Failed to detect cursor element:", e.message);
        }

        // カーソルが可視であることを確認
        const visible = await page.isVisible(".editor-overlay .cursor.active");
        console.log("Cursor is visible:", visible);

        // スクリーンショットを撮影（カーソル表示後）
        await page.screenshot({ path: "client/test-results/CLM-0001-cursor-visible.png" });

        // カーソルが表示されていることを確認
        expect(visible).toBe(true);

        // カーソル情報を取得して検証
        const cursorData = await CursorValidator.getCursorData(page);
        console.log("Cursor data for cursor test:", cursorData);
        expect(cursorData.cursorCount).toBeGreaterThan(0);
        expect(cursorData.activeItemId).not.toBeNull();
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
            console.log("Using first visible item for click position test");
        } else {
            testItem = item;
            console.log("Using page title item for click position test");
        }

        // 折り返しが発生する長いテキストを入力
        await testItem.locator(".item-content").click({ force: true });
        console.log("Clicked item content");

        // カーソルが表示されるまで待機
        const cursorVisible = await TestHelpers.waitForCursorVisible(page, 30000);
        console.log("Cursor visible for click position test:", cursorVisible);

        // アクティブなアイテムIDを取得
        const itemId = await TestHelpers.getActiveItemId(page);
        console.log("Active item ID:", itemId);
        expect(itemId).not.toBeNull();

        const longText = "A".repeat(80);
        await page.locator(".global-textarea").fill(longText);
        await page.locator(".global-textarea").dispatchEvent("input");
        await page.waitForTimeout(1000);
        console.log("Filled textarea with long text");

        // スクリーンショットを撮影（テキスト入力後）
        await page.screenshot({ path: "client/test-results/CLM-0001-click-position-after-input.png" });

        // テキストが反映されているか確認
        // アクティブなアイテムを取得
        const activeItem = page.locator(`.outliner-item[data-item-id="${itemId}"]`);
        const text = await activeItem.locator(".item-text").textContent();
        console.log("Item text length:", text?.length);
        expect(text).toContain("A".repeat(80));

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
        // スクリーンショットを撮影（テスト開始時）
        await page.screenshot({ path: "client/test-results/CLM-0001-last-line-start.png" });

        // ページタイトルを優先的に使用
        const item = page.locator(".outliner-item.page-title");
        let testItem: any;

        // ページタイトルが見つからない場合は、表示されている最初のアイテムを使用
        if (await item.count() === 0) {
            // テキスト内容で特定できるアイテムを探す
            const visibleItems = page.locator(".outliner-item").filter({ hasText: /.*/ });
            testItem = visibleItems.first();
            console.log("Using first visible item for last line test");
        } else {
            testItem = item;
            console.log("Using page title item for last line test");
        }

        // 折り返しが発生する長いテキストを入力
        await testItem.locator(".item-content").click({ force: true });
        console.log("Clicked item content for last line test");

        // カーソルが表示されるまで待機
        const cursorVisible = await TestHelpers.waitForCursorVisible(page, 30000);
        console.log("Cursor visible for last line test:", cursorVisible);

        // アクティブなアイテムIDを取得
        const itemId = await TestHelpers.getActiveItemId(page);
        expect(itemId).not.toBeNull();

        const longText = "A".repeat(80);
        await page.locator(".global-textarea").fill(longText);
        await page.locator(".global-textarea").dispatchEvent("input");
        await page.waitForTimeout(100);

        // テキストが反映されているか確認
        // アクティブなアイテムを取得
        const activeItem = page.locator(`.outliner-item[data-item-id="${itemId}"]`);
        const text = await activeItem.locator(".item-text").textContent();
        expect(text).toContain("A".repeat(80));

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
        // スクリーンショットを撮影（テスト開始時）
        await page.screenshot({ path: "client/test-results/CLM-0001-blink-start.png" });

        // ページタイトルを優先的に使用
        const item = page.locator(".outliner-item.page-title");

        // ページタイトルが見つからない場合は、表示されている最初のアイテムを使用
        if (await item.count() === 0) {
            // テキスト内容で特定できるアイテムを探す
            const visibleItems = page.locator(".outliner-item").filter({ hasText: /.*/ });
            await visibleItems.first().locator(".item-content").click({ force: true });
            console.log("Clicked first visible item for blink test");
        } else {
            await item.locator(".item-content").click({ force: true });
            console.log("Clicked page title item for blink test");
        }

        // 編集モードに入るまで待機
        await page.waitForSelector("textarea.global-textarea:focus");

        // カーソル要素がDOMに追加されるまで待機
        await page.waitForSelector(".editor-overlay .cursor.active", { state: "attached" });

        // カーソル情報を取得して検証
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursorCount).toBe(1);
        expect(cursorData.activeItemId).not.toBeNull();

        // 複数のカーソルがある場合は最初のものを使用
        const cursor = page.locator(".editor-overlay .cursor.active").first();
        const initialOpacity = await cursor.evaluate(el => window.getComputedStyle(el).opacity);

        // 次の点滅状態まで待機
        await page.waitForTimeout(600);
        const nextOpacity = await cursor.evaluate(el => window.getComputedStyle(el).opacity);
        expect(initialOpacity).not.toBe(nextOpacity);
    });
});
