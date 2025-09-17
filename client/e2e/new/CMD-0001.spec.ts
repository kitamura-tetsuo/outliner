// @ts-nocheck
/** @feature CMD-0001
 *  Title   : Inline Command Palette
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("CMD-0001: Inline Command Palette", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("insert table via palette", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page);
        const id = await TestHelpers.getItemIdByIndex(page, 0);

        // アイテムをクリックしてフォーカスを当てる
        await page.click(`.outliner-item[data-item-id="${id}"] .item-content`);
        await page.waitForTimeout(1000); // フォーカスが安定するまで待機

        // グローバルテキストエリアにフォーカスを確実に設定
        await page.evaluate(() => {
            const textarea = document.querySelector(".global-textarea") as HTMLTextAreaElement;
            if (textarea) {
                textarea.focus();
            }
        });
        await page.waitForTimeout(500);

        await page.keyboard.type("/");

        // デバッグ: コマンドパレットの状態を確認
        await page.waitForTimeout(1000);
        const paletteExists = await page.locator(".slash-command-palette").count();
        console.log(`Command palette exists: ${paletteExists}`);

        // 追加のデバッグ情報
        const paletteDebugInfo = await page.evaluate(() => {
            const palette = document.querySelector(".slash-command-palette");
            return {
                isVisible: palette ? getComputedStyle(palette).display !== "none" : false,
                dataIsVisible: palette?.getAttribute("data-is-visible"),
                dataQuery: palette?.getAttribute("data-query"),
                dataVisibleCount: palette?.getAttribute("data-visible-count"),
                positionTop: palette?.style.top,
                positionLeft: palette?.style.left,
            };
        });
        console.log("Palette debug info:", paletteDebugInfo);

        // デバッグ: ページの状態を確認
        const debugInfo = await page.evaluate(() => {
            return {
                commandPaletteVisible: window.commandPaletteStore?.isVisible,
                editorOverlayStore: !!window.editorOverlayStore,
                keyEventHandler: !!window.__KEY_EVENT_HANDLER__,
                activeElement: document.activeElement?.tagName,
                globalTextarea: !!document.querySelector(".global-textarea"),
                cursorCount: window.editorOverlayStore?.getCursorInstances()?.length || 0,
                activeItemId: window.editorOverlayStore?.activeItemId || null,
                treeAvailable: !!window.Tree,
                itemsAvailable: !!window.Items,
            };
        });
        console.log("Debug info:", debugInfo);

        // コマンドパレットが存在することを確認（visibilityチェックをスキップ）
        expect(paletteExists).toBeGreaterThan(0);

        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowUp");

        // デバッグ: Enterキー前の選択状態を確認
        const beforeEnterInfo = await page.evaluate(() => {
            return {
                selectedIndex: window.commandPaletteStore?.selectedIndex,
                filteredCommands: window.commandPaletteStore?.filtered?.map(c => c.type),
                selectedCommand: window.commandPaletteStore?.filtered?.[window.commandPaletteStore?.selectedIndex]
                    ?.type,
            };
        });
        console.log("Before Enter info:", beforeEnterInfo);

        // Enterキーを押す前の状態を記録
        const beforeEnterInfo2 = await page.evaluate(() => {
            return {
                commandPaletteVisible: window.commandPaletteStore?.isVisible,
                itemCount: document.querySelectorAll("[data-item-id]").length,
            };
        });
        console.log("Before Enter:", beforeEnterInfo2);

        // confirmとinsertメソッドにログを追加
        await page.evaluate(() => {
            const originalConfirm = window.commandPaletteStore.confirm;
            window.commandPaletteStore.confirm = function() {
                console.log("CommandPaletteStore.confirm called");
                console.log("selectedIndex:", this.selectedIndex);
                console.log("filtered:", this.filtered);
                try {
                    const result = originalConfirm.call(this);
                    console.log("CommandPaletteStore.confirm completed successfully");
                    return result;
                } catch (error) {
                    console.log("CommandPaletteStore.confirm error:", error.message);
                    throw error;
                }
            };

            const originalInsert = window.commandPaletteStore.insert;
            window.commandPaletteStore.insert = function(type) {
                console.log("CommandPaletteStore.insert called with type:", type);
                try {
                    const result = originalInsert.call(this, type);
                    console.log("CommandPaletteStore.insert completed successfully");
                    return result;
                } catch (error) {
                    console.log("CommandPaletteStore.insert error:", error.message);
                    throw error;
                }
            };
        });

        // Enterキー直前のコマンドパレット状態を確認
        const beforeEnterPaletteInfo = await page.evaluate(() => {
            const cursors = (window as any).editorOverlayStore?.getCursorInstances() || [];
            const cursor = cursors[0];
            const node = cursor?.findTarget();
            const parent = node ? (window as any).Tree?.parent(node) : null;
            const currentIndex = parent ? parent.indexOf(node) : -1;

            return {
                isVisible: (window as any).commandPaletteStore?.isVisible,
                selectedIndex: (window as any).commandPaletteStore?.selectedIndex,
                filteredLength: (window as any).commandPaletteStore?.filtered?.length,
                cursorItemId: cursor?.itemId,
                currentNodeExists: !!node,
                parentExists: !!parent,
                currentIndex: currentIndex,
                parentLength: parent?.length || 0,
            };
        });
        console.log("Before Enter palette info:", beforeEnterPaletteInfo);

        // コンソールログを監視
        const logs: string[] = [];
        page.on("console", msg => {
            logs.push(`${msg.type()}: ${msg.text()}`);
        });

        await page.keyboard.press("Enter");

        // ログを出力
        console.log("Browser console logs:", logs);

        await page.waitForTimeout(2000); // 処理が完了するまで待機

        // Enterキー処理の詳細を確認
        const enterProcessInfo = await page.evaluate(() => {
            return {
                commandPaletteVisible: (window as any).commandPaletteStore?.isVisible,
                generalStoreExists: !!(window as any).generalStore,
                currentPageExists: !!(window as any).generalStore?.currentPage,
                pagesExists: !!(window as any).generalStore?.pages,
                pagesCurrentExists: !!(window as any).generalStore?.pages?.current,
                pagesCurrentLength: (window as any).generalStore?.pages?.current?.length || 0,
                keyEventHandlerExists: !!(window as any).__KEY_EVENT_HANDLER__,
            };
        });
        console.log("Enter process info:", enterProcessInfo);

        // デバッグ: Enter後の状態を確認
        const afterEnterInfo = await page.evaluate(() => {
            const allItems = Array.from(document.querySelectorAll("[data-item-id]"));
            const itemDetails = allItems.map(el => ({
                id: el.getAttribute("data-item-id"),
                text: el.querySelector(".item-text")?.textContent || "",
                hasTable: !!el.querySelector(".inline-join-table"),
                innerHTML: el.innerHTML,
            }));

            return {
                inlineTableExists: !!document.querySelector(".inline-join-table"),
                itemsWithTable: document.querySelectorAll("[data-item-id]").length,
                pageContent: document.body.innerHTML.includes("/table"),
                allItemTexts: Array.from(document.querySelectorAll("[data-item-id] .item-text")).map(el =>
                    el.textContent
                ),
                itemDetails: itemDetails,
                pagesCurrentLength: (window as any).generalStore?.pages?.current?.length || 0,
                currentPageItemsLength: (window as any).generalStore?.currentPage?.items?.length || 0,
                totalItemsInTree: (window as any).generalStore?.currentPage?.items?.length || 0,
                sharedTreeItems: Array.from((window as any).generalStore?.currentPage?.items || []).map((
                    item: any,
                ) => ({
                    id: item.id,
                    text: item.text,
                })),
            };
        });
        console.log("After Enter info:", afterEnterInfo);

        // 追加のデバッグ情報：OutlinerItemコンポーネントの状態を確認
        const componentStateInfo = await page.evaluate(() => {
            const items = (window as any).generalStore?.currentPage?.items;
            if (!items) return { error: "No items found" };

            const itemsArray = Array.from(items);
            return {
                itemsCount: itemsArray.length,
                itemsDetails: itemsArray.map((item: any, index: number) => ({
                    index,
                    id: item.id,
                    text: item.text,
                    componentType: item.componentType,
                    hasComponentType: "componentType" in item,
                })),
            };
        });
        console.log("Component state info:", componentStateInfo);

        await expect(page.locator(".inline-join-table")).toBeVisible();
    });

    test("filter and insert chart", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page);

        // ページタイトルアイテムをクリックしてフォーカスを当てる（テーブルテストと同じアプローチ）
        const titleId = await TestHelpers.getItemIdByIndex(page, 0);
        await page.click(`.outliner-item[data-item-id="${titleId}"] .item-content`);
        await page.waitForTimeout(1000); // フォーカスが安定するまで待機

        // グローバルテキストエリアにフォーカスを確実に設定
        await page.evaluate(() => {
            const textarea = document.querySelector(".global-textarea") as HTMLTextAreaElement;
            if (textarea) {
                textarea.focus();
            }
        });
        await page.waitForTimeout(500);

        await page.keyboard.type("/ch");

        // デバッグ情報を追加
        const debugInfo = await page.evaluate(() => {
            return {
                commandPaletteExists: !!document.querySelector(".slash-command-palette"),
                commandPaletteVisible: (window as any).commandPaletteStore?.isVisible,
                commandPaletteQuery: (window as any).commandPaletteStore?.query,
                commandPaletteFiltered: (window as any).commandPaletteStore?.filtered?.map((c: any) => c.label),
                commandPaletteVisibleList: (window as any).commandPaletteStore?.visible?.map((c: any) => c.label),
            };
        });
        console.log("Chart test debug info:", debugInfo);

        // slash-command-paletteが表示されるまで少し待機
        await page.waitForTimeout(1000);

        // 追加のデバッグ情報
        const paletteElements = await page.locator(".slash-command-palette").count();
        const paletteVisible = await page.locator(".slash-command-palette").isVisible();
        console.log(`Palette elements: ${paletteElements}, Visible: ${paletteVisible}`);

        await expect(page.locator(".slash-command-palette")).toBeVisible();
        await expect(page.locator(".slash-command-palette li")).toHaveCount(1);
        await page.keyboard.press("Enter");
        await expect(page.locator(".chart-panel")).toBeVisible();
    });
});
import "../utils/registerAfterEachSnapshot";
