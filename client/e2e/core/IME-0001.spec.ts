/** @feature IME-0001
 *  Title   : IMEを使用した日本語入力
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import { CursorValidator } from "../utils/cursorValidation";

test.describe("IME-0001: IMEを使用した日本語入力", () => {
    test.beforeEach(async ({ page }) => {
        // アプリを開く
        await page.goto("/");
        // アウトライナーアイテムがレンダリングされるのを待機
        await page.waitForSelector(".outliner-item");
    });

    test("入力途中の文字がカーソル位置に表示される", async ({ page }) => {
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

        // 編集モードに入ったことを確認
        const textarea = page.locator("textarea.global-textarea");
        await textarea.waitFor({ state: 'visible' });
        await textarea.focus();

        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // アクティブなアイテムIDを取得
        const itemId = await TestHelpers.getActiveItemId(page);
        expect(itemId).not.toBeNull();

        // simulate composition events for intermediate text
        await page.evaluate(() => {
            const el = document.querySelector("textarea.global-textarea")!;
            el.dispatchEvent(new CompositionEvent("compositionstart", { data: "" }));
            el.dispatchEvent(new CompositionEvent("compositionupdate", { data: "にほん" }));
        });
        // 表示を待機
        await page.waitForTimeout(100);

        // 中間文字が表示されていることを確認
        const interimText = await page.locator(`.outliner-item[data-item-id="${itemId}"]`).locator(".item-text").textContent();
        expect(interimText).toContain("にほん");
    });

    test("変換候補がカーソル位置に表示される", async ({ page }) => {
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

        // 編集モードに入ったことを確認
        const textarea = page.locator("textarea.global-textarea");
        await textarea.waitFor({ state: 'visible' });
        await textarea.focus();

        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // アクティブなアイテムIDを取得
        const itemId = await TestHelpers.getActiveItemId(page);
        expect(itemId).not.toBeNull();

        // simulate composition events for intermediate and candidate text
        await page.evaluate(() => {
            const el = document.querySelector("textarea.global-textarea")!;
            el.dispatchEvent(new CompositionEvent("compositionstart", { data: "" }));
            el.dispatchEvent(new CompositionEvent("compositionupdate", { data: "にほん" }));
        });
        await page.waitForTimeout(50);
        await page.evaluate(() => {
            const el = document.querySelector("textarea.global-textarea")!;
            el.dispatchEvent(new CompositionEvent("compositionupdate", { data: "日本" }));
        });
        await page.waitForTimeout(100);

        // 変換候補文字が表示されていることを確認
        const candidateText = await page.locator(`.outliner-item[data-item-id="${itemId}"]`).locator(".item-text").textContent();
        expect(candidateText).toContain("日本");
    });

    test("日本語IME入力が可能", async ({ page }) => {
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

        // 編集モードに入ったことを確認
        const textarea = page.locator("textarea.global-textarea");
        await textarea.waitFor({ state: 'visible' });
        await textarea.focus();

        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // アクティブなアイテムIDを取得
        const itemId = await TestHelpers.getActiveItemId(page);
        expect(itemId).not.toBeNull();

        // simulate full composition events
        await page.evaluate(() => {
            const el = document.querySelector("textarea.global-textarea")!;
            el.dispatchEvent(new CompositionEvent("compositionstart", { data: "にほん" }));
            el.dispatchEvent(new CompositionEvent("compositionupdate", { data: "にほん" }));
            el.dispatchEvent(new CompositionEvent("compositionend", { data: "日本" }));
        });
        // DOMの更新を待機
        await page.waitForTimeout(100);

        // 確定文字が反映されていることを確認
        const finalText = await page.locator(`.outliner-item[data-item-id="${itemId}"]`).locator(".item-text").textContent();
        expect(finalText).toContain("日本");
    });
});
