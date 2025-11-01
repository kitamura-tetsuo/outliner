import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FMT-0007
 *  Title   : 内部リンク機能の表示
 *  Source  : docs/client-features.yaml
 */
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
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
    const ensureOutlinerReady = async (page: Page, timeout = 30000): Promise<void> => {
        try {
            await TestHelpers.waitForOutlinerItems(page, timeout);
            return;
        } catch (error) {
            console.warn("waitForOutlinerItems fallback", error instanceof Error ? error.message : error);
        }

        await page.waitForFunction(() => {
            const gs = (window as any).generalStore || (window as any).appStore;
            return !!(gs?.currentPage?.items);
        }, { timeout });

        const hasOutliner = await page.locator(".outliner-item").count();
        expect(hasOutliner, "expected at least one outliner item in fallback").toBeGreaterThan(0);
    };

    const createBlankItem = async (page: Page): Promise<string> => {
        await ensureOutlinerReady(page);
        await page.waitForFunction(() => {
            const gs = (window as any).generalStore || (window as any).appStore;
            return !!(gs?.currentPage?.items);
        }, { timeout: 30000 });
        await page.evaluate(() => {
            const gs = (window as any).generalStore || (window as any).appStore;
            const items = gs?.currentPage?.items;
            if (items && typeof items.addNode === "function") {
                const newItem = items.addNode("tester");
                if (newItem && typeof newItem.updateText === "function") {
                    newItem.updateText("");
                }
            }
        });
        await page.waitForTimeout(200);
        const itemId = await page.evaluate(() => {
            const gs = (window as any).generalStore || (window as any).appStore;
            const items = gs?.currentPage?.items;
            if (!items) return null;
            const length = typeof items.length === "number" ? items.length : 0;
            if (length === 0) return null;
            const lastItem = typeof items.at === "function"
                ? items.at(length - 1)
                : (items as any)[length - 1];
            return lastItem?.id ?? null;
        });
        expect(itemId, "expected a blank outliner item id").toBeTruthy();
        const id = itemId as string;
        await page.locator(`.outliner-item[data-item-id="${id}"]`).waitFor({ state: "visible", timeout: 5000 });
        return id;
    };

    const setItemText = async (page: Page, itemId: string, text: string): Promise<void> => {
        await page.evaluate(({ itemId, text }) => {
            const gs = (window as any).generalStore || (window as any).appStore;
            const items = gs?.currentPage?.items;
            if (!items) return;
            const length = typeof items.length === "number" ? items.length : items?.getLength?.();
            if (typeof length !== "number") return;
            for (let i = 0; i < length; i++) {
                const node = items.at ? items.at(i) : (items as any)[i];
                if (node?.id === itemId) {
                    if (typeof node.updateText === "function") {
                        node.updateText(text);
                    }
                    break;
                }
            }
        }, { itemId, text });
        await page.waitForTimeout(150);
    };

    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    /**
     * @testcase 通常の内部リンク構文が正しく表示される
     * @description [page-name] 形式の内部リンクが正しく表示されることを確認するテスト
     */
    test("通常の内部リンク構文が正しく表示される", async ({ page }) => {
        // テストページをセットアップ
        await ensureOutlinerReady(page);

        // 最初のアイテムを選択
        const firstItemId = await createBlankItem(page);
        const firstItem = page.locator(`.outliner-item[data-item-id="${firstItemId}"]`);
        await firstItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        // 内部リンクテキストを入力
        await page.keyboard.type("[test-page]");

        // 2つ目のアイテムをプログラムで作成してフォーカス
        const secondItemId = await createBlankItem(page);
        const secondItem = page.locator(`.outliner-item[data-item-id="${secondItemId}"]`);
        await secondItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.type("別のアイテム");

        // 3つ目のアイテムも作成してカーソルを移動
        const thirdItemId = await createBlankItem(page);
        const thirdItem = page.locator(`.outliner-item[data-item-id="${thirdItemId}"]`);
        await thirdItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.type("3つ目のアイテム");

        // 明示的にフォーカスを外してレンダリングを安定化
        await page.locator("body").click({ position: { x: 5, y: 5 } });
        await page.waitForTimeout(300);
        await page.waitForFunction(
            (itemId) => {
                const store = (window as any).editorOverlayStore;
                return store && store.getActiveItem && store.getActiveItem() !== itemId;
            },
            firstItemId,
            { timeout: 5000 },
        );
        await expect(firstItem.locator(".item-text .internal-link")).toBeVisible({ timeout: 5000 });

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
        await ensureOutlinerReady(page);

        // 最初のアイテムを選択
        const firstItemId = await createBlankItem(page);
        const firstItem = page.locator(`.outliner-item[data-item-id="${firstItemId}"]`);
        await setItemText(page, firstItemId, "[/project-name/page-name]");

        const secondItemId = await createBlankItem(page);
        await setItemText(page, secondItemId, "別のアイテム");

        const thirdItemId = await createBlankItem(page);
        await setItemText(page, thirdItemId, "3つ目のアイテム");

        await page.locator("body").click({ position: { x: 5, y: 5 } });
        await page.waitForTimeout(300);
        await page.waitForFunction(
            (itemId) => {
                const store = (window as any).editorOverlayStore;
                return store && store.getActiveItem && store.getActiveItem() !== itemId;
            },
            firstItemId,
            { timeout: 5000 },
        );
        await expect(firstItem.locator(".item-text .internal-link")).toBeVisible({ timeout: 5000 });
        await expect(firstItem.locator(".item-text .project-link")).toBeVisible({ timeout: 5000 });

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
        await ensureOutlinerReady(page);

        // 最初のアイテムを選択
        const firstItemId = await createBlankItem(page);
        const firstItem = page.locator(`.outliner-item[data-item-id="${firstItemId}"]`);
        await setItemText(page, firstItemId, "[test-page]");
        await TestHelpers.setCursor(page, firstItemId, 0, "local");
        await TestHelpers.waitForCursorVisible(page);

        const firstItemTextWithCursor = await firstItem.locator(".item-text").innerHTML();

        expect(firstItemTextWithCursor).toContain('class="control-char">[');
        expect(firstItemTextWithCursor).toContain('class="control-char">]');
        expect(firstItemTextWithCursor).not.toContain('href="/test-page"');

        const secondItemId = await createBlankItem(page);
        await setItemText(page, secondItemId, "別のアイテム");
        await TestHelpers.setCursor(page, secondItemId, 0, "local");
        await TestHelpers.waitForCursorVisible(page);

        await page.waitForFunction(
            (itemId) => {
                const store = (window as any).editorOverlayStore;
                return store && store.getActiveItem && store.getActiveItem() !== itemId;
            },
            firstItemId,
            { timeout: 5000 },
        );

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
        await ensureOutlinerReady(page);
        const firstItemId = await createBlankItem(page);
        const firstItem = page.locator(`.outliner-item[data-item-id="${firstItemId}"]`);
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
                        target.updateText("");
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
                    cursor.insertText("\n");
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

        // SharedTreeのデータを取得（フォールバック機能付き）
        const treeData = await TreeValidator.getTreeData(page);

        // デバッグ情報を出力
        console.log("Tree data items:");
        treeData.items.forEach((item: any, index: number) => {
            console.log(`  Item ${index}: "${item.text}"`);
            if (item.items && item.items.length > 0) {
                item.items.forEach((subItem: any, subIndex: number) => {
                    console.log(`    SubItem ${subIndex}: "${subItem.text}"`);
                });
            }
        });

        // データが正しく保存されていることを確認
        // サブアイテムから両方のリンクを含むアイテムを検索
        let linkItem = null;

        for (const item of treeData.items) {
            if (item.items) {
                // itemsがオブジェクトの場合（実際のデータ構造）
                const itemsArray = Array.isArray(item.items) ? item.items : Object.values(item.items);
                for (const subItem of itemsArray) {
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
