/** @feature CLM-0100
 *  Title   : カーソル管理の基本機能
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";

import { CursorValidator } from "../utils/cursorValidation";
import { DataValidationHelpers } from "../utils/dataValidationHelpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("カーソル管理テスト", () => {
    test.afterEach(async ({ page }) => {
        // FluidとYjsのデータ整合性を確認
        await DataValidationHelpers.validateDataConsistency(page);
    });
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });
    test("通常クリックでカーソル数が増えない", async ({ page }) => {
        const base = page.locator('[data-testid="outliner-base"]');
        // ページタイトルを優先的に使用（OutlinerBase配下にスコープ）
        const item = base.locator(".outliner-item.page-title");

        // ページタイトルが見つからない場合は、表示されている最初のアイテムを使用（OutlinerBase配下にスコープ）
        if (await item.count() === 0) {
            // テキスト内容で特定できるアイテムを探す
            const visibleItems = base.locator(".outliner-item").filter({ hasText: /.*/ });
            await visibleItems.first().locator(".item-content").click({ force: true });
        } else {
            await item.locator(".item-content").click({ force: true });
        }

        // 編集モードに入るまで待機
        await page.waitForSelector("textarea.global-textarea:focus");

        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // 初期カーソル数を確認（OutlinerBase配下にスコープ）
        const initialCursorCount = await base.locator(".editor-overlay .cursor").count();
        console.log(`初期カーソル数: ${initialCursorCount}`);

        // 新しいアイテムを追加
        await page.keyboard.press("Enter");
        // デバウンス吸収の最小待機
        await page.waitForTimeout(200);
        await page.keyboard.type("Second item");
        await page.keyboard.press("Escape"); // 編集モードを終了

        // Enter後のカーソル数を確認（OutlinerBase配下にスコープ）
        const cursorCountAfterEnter = await base.locator(".editor-overlay .cursor").count();
        console.log(`Enter後のカーソル数: ${cursorCountAfterEnter}`);

        // 最初のアイテムをクリック（OutlinerBase配下にスコープ）
        const firstItem = base.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click({ force: true });

        // 最初のアイテムクリック後のカーソル数を確認（OutlinerBase配下にスコープ）
        const cursorCountAfterFirstClick = await base.locator(".editor-overlay .cursor").count();
        console.log(`最初のアイテムクリック後のカーソル数: ${cursorCountAfterFirstClick}`);

        // カーソル数が増えていないことを確認
        expect(cursorCountAfterFirstClick).toBeLessThanOrEqual(initialCursorCount);

        // 2番目のアイテムをクリック（OutlinerBase配下にスコープ）
        const secondItem = base.locator(".outliner-item").nth(1);
        await secondItem.locator(".item-content").click({ force: true });

        // 2番目のアイテムクリック後のカーソル数を確認（OutlinerBase配下にスコープ）
        const cursorCountAfterSecondClick = await base.locator(".editor-overlay .cursor").count();
        console.log(`2番目のアイテムクリック後のカーソル数: ${cursorCountAfterSecondClick}`);

        // カーソル数が増えていないことを確認
        expect(cursorCountAfterSecondClick).toBeLessThanOrEqual(initialCursorCount);

        // 最初のアイテムを再度クリック
        await firstItem.locator(".item-content").click({ force: true });

        // 再度クリック後のカーソル数を確認（OutlinerBase配下にスコープ）
        const cursorCountAfterThirdClick = await base.locator(".editor-overlay .cursor").count();
        console.log(`再度クリック後のカーソル数: ${cursorCountAfterThirdClick}`);

        // カーソル数が増えていないことを確認
        expect(cursorCountAfterThirdClick).toBeLessThanOrEqual(initialCursorCount);
    });
});
