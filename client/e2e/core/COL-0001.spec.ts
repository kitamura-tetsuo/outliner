/** @feature COL-0001
 *  Title   : 他ユーザーのカーソル表示
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import { CursorValidator } from "../utils/cursorValidation";

test.describe("COL-0001: 他ユーザーのカーソル表示", () => {
    test("other users' cursor positions appear in real time", async ({ page }, testInfo) => {
        // 初期ユーザーでテストページを作成
        const { projectName, pageName } = await TestHelpers.prepareTestEnvironment(page, testInfo);

        // 最初のアイテムをクリックしてカーソルを表示
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click({ force: true });
        await TestHelpers.waitForCursorVisible(page);

        // カーソル数を確認
        const initialCursor = await CursorValidator.getCursorData(page);
        expect(initialCursor.cursorCount).toBe(1);

        // 別コンテキストのユーザーを起動
        const otherContext = await page.context().browser().newContext();
        const otherPage = await otherContext.newPage();

        // 基本環境を整えて同じページに移動
        await otherPage.goto("/");
        await otherPage.waitForFunction(() => (window as any).__FLUID_STORE__ && (window as any).__SVELTE_GOTO__);
        await TestHelpers.setupTreeDebugger(otherPage);
        await TestHelpers.setupCursorDebugger(otherPage);
        await otherPage.goto(`/${projectName}/${pageName}`);
        await TestHelpers.waitForOutlinerItems(otherPage);

        // 他ユーザーもアイテムをクリックしてカーソルを表示
        const otherFirstItem = otherPage.locator(".outliner-item").first();
        await otherFirstItem.locator(".item-content").click({ force: true });
        await TestHelpers.waitForCursorVisible(otherPage);

        // 同期待ち
        await page.waitForTimeout(500);

        // 元ページで他ユーザーのカーソルが表示されているか検証
        const user1Data = await CursorValidator.getCursorData(page);
        expect(user1Data.cursorCount).toBeGreaterThan(1);

        // 他ページでもカーソルが二つ表示されることを検証
        const user2Data = await CursorValidator.getCursorData(otherPage);
        expect(user2Data.cursorCount).toBeGreaterThan(1);

        await otherContext.close();
    });
});
