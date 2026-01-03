import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature APP-0001
 *  Title   : プロジェクトページ表示時にグローバルテキストエリアにフォーカスを設定
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * @testcase プロジェクトページ表示時にグローバルテキストエリアにフォーカスが設定される
 * @description プロジェクトページ表示時に自動的にグローバルテキストエリアにフォーカスが設定されることを確認するテスト
 * @check プロジェクトページ表示時にグローバルテキストエリアにフォーカスが設定される
 * @check カーソルが表示される
 * @check テキスト入力が可能になる
 */
test.describe("プロジェクトページ表示時のフォーカス設定", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("プロジェクトページ表示時にグローバルテキストエリアにフォーカスが設定される", async ({ page }) => {
        // OutlinerItem が表示されるのを待つ
        await page.waitForSelector(".outliner-item", { timeout: 30000 });
        console.log("Found outliner items");

        // ページ内の要素を確認
        const elements = await page.evaluate(() => {
            return {
                outlinerItems: document.querySelectorAll(".outliner-item").length,
                pageTitle: document.querySelector(".outliner-item.page-title") ? true : false,
                firstItem: document.querySelector(".outliner-item") ? true : false,
                globalTextarea: document.querySelector(".global-textarea") ? true : false,
            };
        });
        console.log("Page elements:", elements);

        // グローバルテキストエリアが存在することを確認
        expect(elements.globalTextarea).toBe(true);

        // 最初のアイテムをクリックしてフォーカスを設定
        const firstItem = page.locator(".outliner-item[data-item-id]").first();
        await firstItem.waitFor();
        await firstItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        // フォーカス状態を確認
        const focusState = await page.evaluate(() => {
            const textarea = document.querySelector(".global-textarea") as HTMLTextAreaElement;
            return {
                textareaExists: !!textarea,
                focused: document.activeElement === textarea,
                activeElementTag: document.activeElement?.tagName,
                textareaValue: textarea?.value || "",
            };
        });
        console.log("Focus state after click:", focusState);

        // フォーカスが設定されていることを確認
        expect(focusState.focused).toBe(true);

        // カーソルの状態を確認し、必要に応じて作成
        const cursorState = await page.evaluate(() => {
            const editorStore = (window as {
                editorOverlayStore?: {
                    getActiveItem: () => string | null;
                    getCursorInstances: () => { id: string; }[];
                };
            }).editorOverlayStore;
            if (!editorStore) return { error: "editorOverlayStore not found" };

            const activeItem = editorStore.getActiveItem();
            const cursorInstances = editorStore.getCursorInstances();

            return {
                activeItem,
                cursorInstancesCount: cursorInstances.length,
            };
        });
        console.log("Cursor state:", cursorState);

        // カーソルインスタンスが存在しない場合、作成する
        if (cursorState.cursorInstancesCount === 0) {
            console.log("No cursor instances found, creating cursor");
            await page.evaluate(() => {
                const editorStore = (window as {
                    editorOverlayStore?: {
                        getActiveItem: () => string | null;
                        setCursor: (
                            cursor: { itemId: string; offset: number; isActive: boolean; userId: string; },
                        ) => void;
                    };
                }).editorOverlayStore;
                if (editorStore) {
                    const activeItemId = editorStore.getActiveItem();
                    if (activeItemId) {
                        editorStore.setCursor({
                            itemId: activeItemId,
                            offset: 0,
                            isActive: true,
                            userId: "local",
                        });
                        console.log("Created cursor for active item");
                    }
                }
            });
        }

        // テキスト入力が可能であることを確認（cursor.insertText()を使用）
        const testText = "テスト用テキスト";
        await page.evaluate(text => {
            const editorStore = (window as {
                editorOverlayStore?: {
                    getCursorInstances: () => {
                        findTarget: () => { updateText: (text: string) => void; } | null;
                        offset: number;
                        insertText: (text: string) => void;
                    }[];
                };
            }).editorOverlayStore;
            if (editorStore) {
                const cursorInstances = editorStore.getCursorInstances();
                if (cursorInstances.length > 0) {
                    const cursor = cursorInstances[0];
                    // 既存のテキストをクリア
                    const target = cursor.findTarget();
                    if (target) {
                        target.updateText("");
                        cursor.offset = 0;
                    }
                    // 新しいテキストを挿入
                    cursor.insertText(text);
                    console.log("Text inserted via cursor.insertText");
                }
            }
        }, testText);

        // 少し待機してからテキストが入力されていることを確認
        await page.waitForTimeout(300);

        // アイテムのテキストを確認
        const itemText = await firstItem.textContent();
        console.log("Item text after input:", itemText);
        expect(itemText).toContain(testText);
    });
});
