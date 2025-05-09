/** @feature CLM-0100
 *  Title   : カーソル管理の基本機能
 *  Source  : docs/client-features.yaml
 */
import { test, expect } from '@playwright/test';
import { setupTestPage } from '../helpers';
import { TestHelpers } from "../utils/testHelpers";
import { CursorValidator } from "../utils/cursorValidation";

test.describe("カーソル管理テスト", () => {
    test.beforeEach(async ({ page }) => {
        await setupTestPage(page);
    });

    test("通常クリックでカーソル数が増えない", async ({ page }) => {
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

        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // 初期カーソル数を確認
        const initialCursorCount = await page.evaluate(() => {
            return document.querySelectorAll('.editor-overlay .cursor').length;
        });
        console.log(`初期カーソル数: ${initialCursorCount}`);

        // 新しいアイテムを追加
        await page.keyboard.press("Enter");
        await page.keyboard.type("Second item");
        await page.keyboard.press("Escape"); // 編集モードを終了

        // Enter後のカーソル数を確認
        const cursorCountAfterEnter = await page.evaluate(() => {
            return document.querySelectorAll('.editor-overlay .cursor').length;
        });
        console.log(`Enter後のカーソル数: ${cursorCountAfterEnter}`);

        // 最初のアイテムをクリック
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click({ force: true });

        // 最初のアイテムクリック後のカーソル数を確認
        const cursorCountAfterFirstClick = await page.evaluate(() => {
            return document.querySelectorAll('.editor-overlay .cursor').length;
        });
        console.log(`最初のアイテムクリック後のカーソル数: ${cursorCountAfterFirstClick}`);

        // カーソル数が増えていないことを確認
        expect(cursorCountAfterFirstClick).toBeLessThanOrEqual(initialCursorCount);

        // 2番目のアイテムをクリック
        const secondItem = page.locator(".outliner-item").nth(1);
        await secondItem.locator(".item-content").click({ force: true });

        // 2番目のアイテムクリック後のカーソル数を確認
        const cursorCountAfterSecondClick = await page.evaluate(() => {
            return document.querySelectorAll('.editor-overlay .cursor').length;
        });
        console.log(`2番目のアイテムクリック後のカーソル数: ${cursorCountAfterSecondClick}`);

        // カーソル数が増えていないことを確認
        expect(cursorCountAfterSecondClick).toBeLessThanOrEqual(initialCursorCount);

        // 最初のアイテムを再度クリック
        await firstItem.locator(".item-content").click({ force: true });

        // 再度クリック後のカーソル数を確認
        const cursorCountAfterThirdClick = await page.evaluate(() => {
            return document.querySelectorAll('.editor-overlay .cursor').length;
        });
        console.log(`再度クリック後のカーソル数: ${cursorCountAfterThirdClick}`);

        // カーソル数が増えていないことを確認
        expect(cursorCountAfterThirdClick).toBeLessThanOrEqual(initialCursorCount);
    });
});
