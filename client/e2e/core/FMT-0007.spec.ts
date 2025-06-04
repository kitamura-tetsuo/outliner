import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import { TreeValidator } from "../utils/treeValidation";

/**
 * @file FMT-0007.spec.ts
 * @description 内部リンク機能のテスト
 * 内部リンクの表示と機能をテストします。
 * @playwright
 * @title 内部リンク機能
 */

test.describe("FMT-0007: 内部リンク機能", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    /**
     * @testcase 通常の内部リンク構文が正しく表示される
     * @description [page-name] 形式の内部リンクが正しく表示されることを確認するテスト
     */
    test("通常の内部リンク構文が正しく表示される", async ({ page }) => {
        // テストページをセットアップ

        // 最初のアイテムを選択
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        // 内部リンクテキストを入力
        await page.keyboard.type("[test-page]");

        // 2つ目のアイテムを作成
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);

        // 別のテキストを入力
        await page.keyboard.type("別のアイテム");

        // 3つ目のアイテムをクリック（カーソルを最初のアイテムから離す）
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.type("3つ目のアイテム");

        // 最初のアイテムのテキスト内容を確認（内部リンクが適用されていること）
        const firstItemText = await firstItem.locator(".item-text").innerHTML();

        // 内部リンクが適用されていることを確認
        expect(firstItemText).toContain("internal-link");
        expect(firstItemText).toContain("test-page");
        expect(firstItemText).toContain('href="/test-page"');
    });

    /**
     * @testcase プロジェクト内部リンク構文が正しく表示される
     * @description [/project-name/page-name] 形式の内部リンクが正しく表示されることを確認するテスト
     */
    test("プロジェクト内部リンク構文が正しく表示される", async ({ page }) => {
        // テストページをセットアップ

        // 最初のアイテムを選択
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        // プロジェクト内部リンクテキストを入力
        await page.keyboard.type("[/project-name/page-name]");

        // 2つ目のアイテムを作成
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);

        // 別のテキストを入力
        await page.keyboard.type("別のアイテム");

        // 3つ目のアイテムをクリック（カーソルを最初のアイテムから離す）
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.type("3つ目のアイテム");

        // 最初のアイテムのテキスト内容を確認（内部リンクが適用されていること）
        const firstItemText = await firstItem.locator(".item-text").innerHTML();

        // 内部リンクが適用されていることを確認
        expect(firstItemText).toContain("internal-link");
        expect(firstItemText).toContain("project-link");
        expect(firstItemText).toContain("project-name/page-name");
        expect(firstItemText).toContain('href="/project-name/page-name"');
    });

    /**
     * @testcase カーソルがあるアイテムでは内部リンクがプレーンテキストで表示される
     * @description カーソルがあるアイテムでは内部リンクがプレーンテキストで表示されることを確認するテスト
     */
    test("カーソルがあるアイテムでは内部リンクがプレーンテキストで表示される", async ({ page }) => {
        // テストページをセットアップ

        // 最初のアイテムを選択
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        // 内部リンクテキストを入力
        await page.keyboard.type("[test-page]");

        // カーソルがあるアイテムのテキスト内容を確認（制御文字が表示されていること）
        const firstItemTextWithCursor = await firstItem.locator(".item-text").innerHTML();

        // 制御文字が表示されていることを確認
        expect(firstItemTextWithCursor).toContain('class="control-char">[');
        expect(firstItemTextWithCursor).toContain('class="control-char">]');
        expect(firstItemTextWithCursor).toContain('href="/test-page"');

        // 2つ目のアイテムを作成してカーソルを移動
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.type("別のアイテム");

        // 最初のアイテムのテキスト内容を確認（内部リンクが適用されていること）
        const firstItemTextWithoutCursor = await firstItem.locator(".item-text").innerHTML();

        // 内部リンクが適用されていることを確認
        expect(firstItemTextWithoutCursor).toContain("internal-link");
        expect(firstItemTextWithoutCursor).toContain("test-page");
        expect(firstItemTextWithoutCursor).toContain('href="/test-page"');
    });

    /**
     * @testcase 内部リンクのデータが正しく保存される
     * @description 内部リンクのデータが正しく保存されることを確認するテスト
     */
    test("内部リンクのデータが正しく保存される", async ({ page }) => {
        // ページタイトル以外のアイテムを選択（2番目のアイテム）
        const firstItem = page.locator(".outliner-item").nth(1);
        await firstItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        // カーソルの状態を確認し、必要に応じて作成
        const cursorState = await page.evaluate(() => {
            const editorStore = (window as any).editorOverlayStore;
            if (!editorStore) return { error: 'editorOverlayStore not found' };

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
                            userId: 'local'
                        });
                    }
                }
            });
        }

        // cursor.insertText()を使用して通常の内部リンクを挿入
        await page.evaluate(() => {
            const editorStore = (window as any).editorOverlayStore;
            if (editorStore) {
                const cursorInstances = editorStore.getCursorInstances();
                if (cursorInstances.length > 0) {
                    const cursor = cursorInstances[0];
                    // 既存のテキストをクリア
                    const target = cursor.findTarget();
                    if (target) {
                        target.updateText('');
                        cursor.offset = 0;
                    }
                    // 通常の内部リンクを挿入
                    cursor.insertText("[test-page]");
                }
            }
        });

        // 改行を挿入して新しいアイテムを作成
        await page.evaluate(() => {
            const editorStore = (window as any).editorOverlayStore;
            if (editorStore) {
                const cursorInstances = editorStore.getCursorInstances();
                if (cursorInstances.length > 0) {
                    const cursor = cursorInstances[0];
                    cursor.insertText('\n');
                }
            }
        });

        // プロジェクト内部リンクを挿入
        await page.evaluate(() => {
            const editorStore = (window as any).editorOverlayStore;
            if (editorStore) {
                const cursorInstances = editorStore.getCursorInstances();
                if (cursorInstances.length > 0) {
                    const cursor = cursorInstances[0];
                    cursor.insertText("[/project-name/page-name]");
                }
            }
        });

        // 少し待機してデータが反映されるのを待つ
        await page.waitForTimeout(500);

        // SharedTreeのデータを取得
        const treeData = await TreeValidator.getTreeData(page);

        // デバッグ情報を出力
        console.log("Tree data items:");
        treeData.items.forEach((item, index) => {
            console.log(`  Item ${index}: "${item.text}"`);
            if (item.items && item.items.length > 0) {
                item.items.forEach((subItem, subIndex) => {
                    console.log(`    SubItem ${subIndex}: "${subItem.text}"`);
                });
            }
        });

        // データが正しく保存されていることを確認
        // サブアイテムから両方のリンクを含むアイテムを検索
        let linkItem = null;

        for (const item of treeData.items) {
            if (item.items) {
                for (const subItem of item.items) {
                    if (subItem.text.includes("[test-page]") && subItem.text.includes("[/project-name/page-name]")) {
                        linkItem = subItem;
                        break;
                    }
                }
            }
        }

        // 両方のリンクを含むアイテムが見つかることを確認
        expect(linkItem).not.toBeNull();
        expect(linkItem!.text).toContain("[test-page]");
        expect(linkItem!.text).toContain("[/project-name/page-name]");
    });
});
