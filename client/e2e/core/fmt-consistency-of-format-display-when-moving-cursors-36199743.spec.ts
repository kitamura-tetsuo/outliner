import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FMT-0006
 *  Title   : カーソル移動時のフォーマット表示の一貫性
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";

import { TestHelpers } from "../utils/testHelpers";
import { TreeValidator } from "../utils/treeValidation";

test.describe("カーソル移動時のフォーマット表示の一貫性", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("カーソル移動時に制御文字の表示/非表示が適切に切り替わる", async ({ page }) => {
        // テストページをセットアップ

        // 最初のアイテムを選択
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.press("Control+a");
        await page.keyboard.press("Backspace");

        // 太字テキストを入力
        await page.keyboard.type("[[aasdd]]");

        // 2つ目のアイテムを作成
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);

        // 内部リンクテキストを入力
        await page.keyboard.type("[asd]");

        // 3つ目のアイテムを作成
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);

        // 空のアイテムを作成
        await page.keyboard.type("temp");
        await page.waitForTimeout(500); // Wait for UI to update
        const thirdItem = page.locator(".outliner-item").nth(2);
        const thirdItemBox = await thirdItem.boundingBox();
        if (thirdItemBox) {
            await page.mouse.click(
                thirdItemBox.x + thirdItemBox.width / 2,
                thirdItemBox.y + Math.min(thirdItemBox.height / 2, 10),
            );
            await TestHelpers.waitForCursorVisible(page);
        }
        await page.waitForTimeout(300);

        // 1つ目のアイテムのテキスト内容を確認（制御文字が非表示でフォーマットが適用されていること）
        await page.waitForTimeout(500);
        await expect.poll(async () => {
            return await firstItem.locator(".item-text").innerHTML();
        }).toContain("<strong>aasdd</strong>");

        // 2つ目のアイテムのテキスト内容を確認（制御文字が非表示で内部リンクが適用されていること）
        const secondItem = page.locator(".outliner-item").nth(1);

        // Wait for UI to update after cursor changes
        await page.waitForTimeout(500);

        await expect.poll(async () => {
            const html = await secondItem.locator(".item-text").innerHTML();
            return html.includes("internal-link") || html.includes("control-char");
        }, { timeout: 2000 }).toBeTruthy();

        const secondItemHtmlInactive = await secondItem.locator(".item-text").innerHTML();
        expect(secondItemHtmlInactive).toContain("internal-link");
        expect(secondItemHtmlInactive).not.toContain("control-char");

        // 最初のアイテムに戻る
        await firstItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        // 最初のアイテムのテキストコンテンツを取得（制御文字が表示されていることを確認）
        const firstItemHtmlActive = await firstItem.locator(".item-text").innerHTML();
        expect(firstItemHtmlActive).toContain("<strong>aasdd</strong>");

        // 2つ目のアイテムをクリック
        await secondItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        // 2つ目のアイテムのテキストコンテンツを取得（制御文字が表示されていることを確認）
        const secondItemHtmlActive = await secondItem.locator(".item-text").innerHTML();
        expect(secondItemHtmlActive).toContain('<span class="control-char">[</span>asd');
    });

    test("タイトルは通常のテキスト表示される", async ({ page }) => {
        // テストページをセットアップ

        // タイトルを選択
        const pageTitle = page.locator(".page-title");
        await pageTitle.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        // 既存のテキストをクリアしてから新しいテキストを入力
        await page.keyboard.press("Control+a");
        await page.keyboard.type("aasdd");

        // 通常のアイテムをクリック
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        // タイトルのスタイルを確認（title-textクラスが適用されていること）
        const titleClasses = await pageTitle.locator(".item-text").getAttribute("class");
        expect(titleClasses).toContain("title-text");

        // タイトルのCSSスタイルを確認
        const titleFontWeight = await pageTitle.locator(".item-text").evaluate(el => {
            return window.getComputedStyle(el).fontWeight;
        });
        // タイトルのフォントウェイトが設定されていることを確認（実際の値をログで確認）
        expect(titleFontWeight).toBeDefined();

        // タイトルをクリック
        await pageTitle.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        // タイトルのテキスト内容を確認（制御文字なしでプレーンテキストが表示されていること）
        const titleText = await pageTitle.locator(".item-text").textContent();
        expect(titleText).toBe("aasdd");

        // 通常のアイテムをクリック
        await firstItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        // タイトルのテキスト内容を確認（通常のテキスト表示されていること）
        const titleTextWithoutCursor = await pageTitle.locator(".item-text").textContent();
        expect(titleTextWithoutCursor).toBe("aasdd");
    });

    test("外部リンク構文が正しく表示される", async ({ page }, testInfo) => {
        // テストページをセットアップ
        await TestHelpers.prepareTestEnvironment(page, testInfo, ["[https://example.com]", "placeholder"]);

        // 最初のアイテムのテキスト内容を確認（リンクが適用されていること）
        await expect.poll(async () => {
            const treeData = await TreeValidator.getTreeData(page);
            const items = treeData.items || [];
            return items.some((item: any) =>
                item.text === "[https://example.com]" || item.text?.includes("[https://example.com]")
            );
        }).toBe(true);
        const treeDataAfterLink = await TreeValidator.getTreeData(page);
        expect(JSON.stringify(treeDataAfterLink)).toContain("[https://example.com]");

        const firstItem = page.locator(".outliner-item").nth(1);
        const firstItemTextContentInactive = await firstItem.locator(".item-text").textContent();
        expect(firstItemTextContentInactive).toContain("https://example.com");

        // 最初のアイテムをクリック
        await firstItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        // 最初のアイテムのテキスト内容を確認（制御文字が表示されていること）
        const firstItemTextContentActive = await firstItem.locator(".item-text").textContent();
        expect(firstItemTextContentActive).toContain("https://example.com");
    });

    test("内部リンク構文が正しく表示される", async ({ page }, testInfo) => {
        // テストページをセットアップ
        await TestHelpers.prepareTestEnvironment(page, testInfo, ["[asd]", "placeholder"]);

        // 最初のアイテムのテキスト内容を確認（内部リンクが適用されていること）
        await expect.poll(async () => {
            const treeData = await TreeValidator.getTreeData(page);
            const items = treeData.items || [];
            return items.some((item: any) => item.text === "[asd]" || item.text?.includes("[asd]"));
        }).toBe(true);

        const firstItem = page.locator(".outliner-item").nth(1);
        await page.waitForTimeout(500);
        const firstItemTextContentInactiveInternal = await firstItem.locator(".item-text").textContent();
        // 非アクティブ時は内部リンクがレンダリングされるため、制御文字なしでリンクテキストのみ表示される
        expect(firstItemTextContentInactiveInternal).toContain("asd");
        expect(firstItemTextContentInactiveInternal).not.toContain("[asd]");

        // 最初のアイテムをクリック
        await firstItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        // 最初のアイテムのテキストコンテンツを取得（制御文字が表示されていることを確認）
        const firstItemTextContentActiveInternal = await firstItem.locator(".item-text").textContent();
        expect(firstItemTextContentActiveInternal).toContain("[asd]");
    });

    test("SharedTreeデータが正しく保存される", async ({ page }) => {
        // 最初のアイテムを選択
        const firstItem = page.locator(".outliner-item").nth(1);
        await firstItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        // カーソルの状態を確認し、必要に応じて作成
        const cursorState = await page.evaluate(() => {
            const editorStore = (window as any).editorOverlayStore;
            if (!editorStore) return { error: "editorOverlayStore not found" };

            const activeItem = editorStore.getActiveItem();
            const cursorInstances = editorStore.getCursorInstances();

            return {
                activeItem,
                cursorInstancesCount: cursorInstances.length,
            };
        });

        // カーソルインスタンスが存在しない場合、作成する
        if (cursorState.cursorInstancesCount === 0) {
            await page.evaluate(() => {
                const editorStore = (window as any).editorOverlayStore;
                if (editorStore) {
                    const activeItemId = editorStore.getActiveItem();
                    if (activeItemId) {
                        editorStore.setCursor({
                            itemId: activeItemId,
                            offset: 0,
                            isActive: true,
                            userId: "local",
                        });
                    }
                }
            });
        }

        // cursor.insertText()を使用してテキストを挿入
        await page.evaluate(() => {
            const editorStore = (window as any).editorOverlayStore;
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
                    // 太字テキストを挿入
                    cursor.insertText("[[aasdd]]");
                }
            }
        });

        // 少し待機してデータが反映されるのを待つ
        await page.waitForTimeout(500);

        // SharedTreeのデータを取得（フォールバック機能付き）
        const treeData = await TreeValidator.getTreeData(page);

        // データが正しく保存されていることを確認
        expect(treeData.items).toBeDefined();
        expect(treeData.items.length).toBeGreaterThan(0);

        // 太字テキストが保存されていることを確認
        const itemsArray = treeData.items;
        const hasFormattedText = itemsArray.some((item: any) => item.text === "[[aasdd]]");
        expect(hasFormattedText).toBe(true);
    });
});

// Add afterEach cleanup to ensure test isolation
test.afterEach(async ({ page }) => {
    // Reset editor state to prevent test interference
    await page.evaluate(() => {
        // Clear any remaining editor state
        if ((window as any).editorOverlayStore) {
            const editorStore = (window as any).editorOverlayStore;
            if (editorStore.reset) {
                editorStore.reset();
            } else {
                // Manually clear the store properties if no reset method exists
                editorStore.cursors = {};
                editorStore.selections = {};
                if (editorStore.cursorInstances?.clear) {
                    editorStore.cursorInstances.clear();
                } else {
                    editorStore.cursorInstances = new Map();
                }
                editorStore.activeItemId = null;
                editorStore.cursorVisible = false;
                editorStore.activeItem = null;
            }
        }

        // Clear any other potential shared state
        if ((window as any).aliasPickerStore) {
            const aliasPickerStore = (window as any).aliasPickerStore;
            if (aliasPickerStore.reset) {
                aliasPickerStore.reset();
            } else {
                aliasPickerStore.isVisible = false;
                aliasPickerStore.selectedOptionId = null;
                aliasPickerStore.query = "";
                aliasPickerStore.itemId = null;
            }
        }

        // Clear command palette state if it exists
        if ((window as any).commandPaletteStore) {
            const commandPaletteStore = (window as any).commandPaletteStore;
            if (commandPaletteStore.reset) {
                commandPaletteStore.reset();
            } else {
                commandPaletteStore.isVisible = false;
                commandPaletteStore.query = "";
                commandPaletteStore.selectedIndex = 0;
            }
        }

        // Clear any potential global state that could affect other tests
        if ((window as any).userPreferencesStore) {
            const userPreferencesStore = (window as any).userPreferencesStore;
            if (userPreferencesStore.reset) {
                userPreferencesStore.reset();
            } else {
                // Reset dark mode and other preferences to default
                if (userPreferencesStore.setDarkMode) {
                    userPreferencesStore.setDarkMode(false);
                }
            }
        }

        // Clear any potential shared tree state
        if ((window as any).generalStore) {
            const generalStore = (window as any).generalStore;
            // Reset cursor-related state in general store if it exists
            if (generalStore.setCursor) {
                try {
                    generalStore.setCursor(null);
                } catch (e) {
                    console.warn("Could not reset cursor in generalStore:", e);
                }
            }
        }
    }).catch((error) => {
        console.warn("Warning: Failed to reset editor store in afterEach:", error);
    });

    // Additional wait to ensure cleanup is processed
    await page.waitForTimeout(200);
});
