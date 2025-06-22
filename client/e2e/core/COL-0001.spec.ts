/** @feature COL-0001
 *  Title   : 他ユーザーのカーソル表示
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

test.describe("COL-0001: 他ユーザーのカーソル表示", () => {
    test("basic cursor functionality works", async ({ page }, testInfo) => {
        // 初期ユーザーでテストページを作成
        const { projectName, pageName } = await TestHelpers.prepareTestEnvironment(page, testInfo);

        // 最初のアイテムをクリックしてカーソルを表示
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click({ force: true });
        await TestHelpers.waitForCursorVisible(page);

        // カーソル数を確認
        const initialCursor = await CursorValidator.getCursorData(page);
        expect(initialCursor.cursorCount).toBe(1);

        // 基本的なカーソル機能が動作していることを確認
        expect(initialCursor.activeItemId).not.toBeNull();
    });
});
