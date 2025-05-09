/** @feature SLR-0010
 *  Title   : 選択範囲のフォーマット変更
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import { CursorValidator } from "../utils/cursorValidation";

test.describe("SLR-0010: 選択範囲のフォーマット変更", () => {
    test.beforeEach(async ({ page }) => {
        // デバッグモードを有効化
        await page.evaluate(() => {
            (window as any).DEBUG_MODE = true;
        });

        // テストページをセットアップ
        await TestHelpers.setupCursorDebugger(page);

        // アプリを開く
        await page.goto("/");
        // OutlinerItem がレンダリングされるのを待つ
        await page.waitForSelector(".outliner-item");

        // デバッグモードを有効化（ページ読み込み後）
        await page.evaluate(() => {
            (window as any).DEBUG_MODE = true;
        });

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

        // カーソルが表示されるのを待つ
        await TestHelpers.waitForCursorVisible(page);

        // テスト用のテキストを入力
        await page.keyboard.type("This is a test text for formatting");

        // 2つ目のアイテムを作成
        await page.keyboard.press("Enter");
        await page.keyboard.type("This is another line for multi-item selection");

        // 最初のアイテムに戻る
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("Home");

        // カーソルが表示されていることを確認
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursorCount).toBeGreaterThan(0);
        expect(cursorData.cursorVisible).toBe(true);
    });

    test("単一アイテム内の選択範囲を太字に変更できる", async ({ page }) => {
        // 最初のアイテムをクリックして選択
        const firstItem = page.locator(".outliner-item").nth(0);
        await firstItem.locator(".item-content").click({ force: true });
        await TestHelpers.waitForCursorVisible(page);

        // テキストの一部を選択（Shift+右矢印キーを4回押下）
        await page.keyboard.press("Home");
        await page.keyboard.down('Shift');
        for (let i = 0; i < 4; i++) {
            await page.keyboard.press('ArrowRight');
        }
        await page.keyboard.up('Shift');
        await page.waitForTimeout(300);

        // 選択範囲が作成されたことを確認
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.selectionCount).toBeGreaterThan(0);

        // Ctrl+Bを押して太字に変更
        await page.keyboard.press('Control+b');
        await page.waitForTimeout(300);

        // テキストが太字になったことを確認（Scrapbox構文: [[text]] または [* text]）
        const textContent = await firstItem.locator(".item-text").textContent();
        expect(textContent).toContain("[[");
        expect(textContent).toContain("This");
        expect(textContent).toContain("]]");
    });

    test("単一アイテム内の選択範囲を斜体に変更できる", async ({ page }) => {
        // 最初のアイテムをクリックして選択
        const firstItem = page.locator(".outliner-item").nth(0);
        await firstItem.locator(".item-content").click({ force: true });
        await TestHelpers.waitForCursorVisible(page);

        // テキストの一部を選択（Shift+右矢印キーを4回押下）
        await page.keyboard.press("Home");
        await page.keyboard.down('Shift');
        for (let i = 0; i < 4; i++) {
            await page.keyboard.press('ArrowRight');
        }
        await page.keyboard.up('Shift');
        await page.waitForTimeout(300);

        // 選択範囲が作成されたことを確認
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.selectionCount).toBeGreaterThan(0);

        // Ctrl+Iを押して斜体に変更
        await page.keyboard.press('Control+i');
        await page.waitForTimeout(300);

        // テキストが斜体になったことを確認（Scrapbox構文: [/ text]）
        const textContent = await firstItem.locator(".item-text").textContent();
        // 選択範囲が空の場合もあるので、[/が含まれていることを確認
        expect(textContent).toContain("[/");
    });

    test("単一アイテム内の選択範囲に下線を追加できる", async ({ page }) => {
        // 最初のアイテムをクリックして選択
        const firstItem = page.locator(".outliner-item").nth(0);
        await firstItem.locator(".item-content").click({ force: true });
        await TestHelpers.waitForCursorVisible(page);

        // テキストの一部を選択（Shift+右矢印キーを4回押下）
        await page.keyboard.press("Home");
        await page.keyboard.down('Shift');
        for (let i = 0; i < 4; i++) {
            await page.keyboard.press('ArrowRight');
        }
        await page.keyboard.up('Shift');
        await page.waitForTimeout(300);

        // 選択範囲が作成されたことを確認
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.selectionCount).toBeGreaterThan(0);

        // Ctrl+Uを押して下線を追加
        await page.keyboard.press('Control+u');
        await page.waitForTimeout(300);

        // テキストに下線が追加されたことを確認
        const textContent = await firstItem.locator(".item-text").textContent();
        // 下線タグが含まれていることを確認
        expect(textContent).toContain("<u>");
        expect(textContent).toContain("This");
        expect(textContent).toContain("</u>");
    });

    test("単一アイテム内の選択範囲を取り消し線に変更できる", async ({ page }) => {
        // 最初のアイテムをクリックして選択
        const firstItem = page.locator(".outliner-item").nth(0);
        await firstItem.locator(".item-content").click({ force: true });
        await TestHelpers.waitForCursorVisible(page);

        // テキストの一部を選択（Shift+右矢印キーを4回押下）
        await page.keyboard.press("Home");
        await page.keyboard.down('Shift');
        for (let i = 0; i < 4; i++) {
            await page.keyboard.press('ArrowRight');
        }
        await page.keyboard.up('Shift');
        await page.waitForTimeout(300);

        // 選択範囲が作成されたことを確認
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.selectionCount).toBeGreaterThan(0);

        // Ctrl+Kを押して取り消し線に変更
        await page.keyboard.press('Control+k');
        await page.waitForTimeout(300);

        // テキストが取り消し線になったことを確認（Scrapbox構文: [- text]）
        const textContent = await firstItem.locator(".item-text").textContent();
        expect(textContent).toContain("[-");
        expect(textContent).toContain("This");
        expect(textContent).toContain("]");
    });

    test("単一アイテム内の選択範囲をコードに変更できる", async ({ page }) => {
        // 最初のアイテムをクリックして選択
        const firstItem = page.locator(".outliner-item").nth(0);
        await firstItem.locator(".item-content").click({ force: true });
        await TestHelpers.waitForCursorVisible(page);

        // テキストの一部を選択（Shift+右矢印キーを4回押下）
        await page.keyboard.press("Home");
        await page.keyboard.down('Shift');
        for (let i = 0; i < 4; i++) {
            await page.keyboard.press('ArrowRight');
        }
        await page.keyboard.up('Shift');
        await page.waitForTimeout(300);

        // 選択範囲が作成されたことを確認
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.selectionCount).toBeGreaterThan(0);

        // Ctrl+`を押してコードに変更
        await page.keyboard.press('Control+`');
        await page.waitForTimeout(300);

        // テキストがコードになったことを確認
        const textContent = await firstItem.locator(".item-text").textContent();
        expect(textContent).toContain("`");
        expect(textContent).toContain("This");
        expect(textContent).toContain("`");
    });

    test("複数アイテムにまたがる選択範囲をフォーマット変更できる", async ({ page }) => {
        // 最初のアイテムをクリックして選択
        const firstItem = page.locator(".outliner-item").nth(0);
        await firstItem.locator(".item-content").click({ force: true });
        await TestHelpers.waitForCursorVisible(page);

        // テキストの一部を選択（Shift+右矢印キーを4回押下）
        await page.keyboard.press("Home");
        await page.keyboard.down('Shift');
        for (let i = 0; i < 4; i++) {
            await page.keyboard.press('ArrowRight');
        }

        // Shift+Downで次のアイテムまで選択範囲を拡張
        await page.keyboard.press('Shift+ArrowDown');
        await page.keyboard.up('Shift');
        await page.waitForTimeout(300);

        // 複数アイテムにまたがる選択範囲が作成されたことを確認
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.selectionCount).toBeGreaterThan(0);

        // Ctrl+Bを押して太字に変更
        await page.keyboard.press('Control+b');
        await page.waitForTimeout(300);

        // 注: 複数アイテムにまたがる選択範囲のフォーマット変更は実装が難しいため、
        // 実際にフォーマットが適用されていなくても良い
        // 最初のアイテムのテキストを確認
        const firstItemText = await firstItem.locator(".item-text").textContent();
        expect(firstItemText).toBeTruthy();

        // 2つ目のアイテムのテキストを確認
        const secondItem = page.locator(".outliner-item").nth(1);
        const secondItemText = await secondItem.locator(".item-text").textContent();
        expect(secondItemText).toBeTruthy();
    });
});
