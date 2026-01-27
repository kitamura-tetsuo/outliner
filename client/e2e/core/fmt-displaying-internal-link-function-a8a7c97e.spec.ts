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
            await TestHelpers.waitForOutlinerItems(page, 1, timeout);
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
        // Ensure the app is fully loaded and items are partially visible before accessing the store
        await TestHelpers.waitForOutlinerItems(page);

        // Double check store availability just in case
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
        // 共通のセットアップ（必要に応じて）
        await TestHelpers.setupTreeDebugger(page);
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
        await page.waitForTimeout(500);
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
        const currentUrl = page.url();
        const urlParts = new URL(currentUrl).pathname.split("/").filter(Boolean);
        const projectNameEncoded = urlParts[0];

        expect(firstItemText).toContain("internal-link");
        expect(firstItemText).toContain("test-page");
        expect(firstItemText).toContain(`href="/${projectNameEncoded}/test-page"`);
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
        await page.waitForTimeout(500);
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
        const currentUrl = page.url();
        const urlParts = new URL(currentUrl).pathname.split("/").filter(Boolean);
        const projectNameEncoded = urlParts[0];

        expect(firstItemTextWithoutCursor).toContain("internal-link");
        expect(firstItemTextWithoutCursor).toContain("test-page");
        expect(firstItemTextWithoutCursor).toContain(`href="/${projectNameEncoded}/test-page"`);
    });

    /**
     * @testcase 内部リンクのデータが正しく保存される
     * @description 内部リンクのデータが正しく保存されることを確認するテスト
     */
    test("内部リンクのデータが正しく保存される", async ({ page }, testInfo) => {
        const testLines = [
            "通常のリンク: [test-page]",
            "プロジェクトリンク: [/project-name/page-name]",
            "両方: [test-page] と [/project-name/page-name]",
        ];

        // 環境の準備（自動的にシードされる）
        await TestHelpers.prepareTestEnvironment(page, testInfo, testLines);
        await ensureOutlinerReady(page);

        // SharedTreeのデータを取得
        const treeData = await TreeValidator.getTreeData(page);

        // 全アイテムから各リンクを含むアイテムを検索
        function findItemWithText(items: any[] | any, searchText: string): any {
            if (!items) return null;
            const itemsArray = Array.isArray(items) ? items : Object.values(items);
            for (const item of itemsArray) {
                const text = String(item.text || "");
                if (text.includes(searchText)) {
                    return item;
                }
                if (item.items) {
                    const found = findItemWithText(item.items, searchText);
                    if (found) return found;
                }
            }
            return null;
        }

        // 1. 通常の内部リンクが保存されているか
        const normalLinkItem = findItemWithText(treeData.items, "[test-page]");
        expect(normalLinkItem).not.toBeNull();

        // 2. プロジェクト内部リンクが保存されているか
        const projectLinkItem = findItemWithText(treeData.items, "[/project-name/page-name]");
        expect(projectLinkItem).not.toBeNull();
    });
});
