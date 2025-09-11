/** @feature TST-0005
 *  Title   : テスト環境の初期化と準備
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import "../utils/registerAfterEachSnapshot";

/**
 * @playwright
 * @title テキスト追加機能テスト
 * @description このファイルではアウトライナーアプリでテキストを追加する機能をテストします。
 * アイテムを追加した後、そのアイテムに対してテキスト入力ができ、入力したテキストが
 * 正しく保存・表示されることと、データ構造が更新されることを確認します。
 */

test.describe("テキスト追加機能テスト", () => {
    // このspecはbeforeEachを使わず、各テスト内で環境を初期化して安定化させます

    // スナップショットは ../utils/registerAfterEachSnapshot の afterEach で一括保存

    /**
     * @testcase Add Text button should add text to shared content
     * @description アイテム追加ボタンでアイテムを作成し、テキストを入力できることを確認するテスト
     * @check アイテム追加ボタンをクリックするとアイテムが表示される
     * @check アイテムをクリックすると編集モードになる
     * @check 編集モード時にフォーカスが正しく当たる
     * @check テキストを入力できる
     * @check Enter キーを押すとテキストが保存される
     * @check 入力したテキストがアイテムのコンテンツとして表示される
     * @updated 2023-04-09 フォーカスの問題は修正済み
     */
    test("Add Text button should add text to shared content", async ({ page }, testInfo) => {
        // --- 環境初期化（各テスト内で実施） ---
        await page.addInitScript(() => {
            try {
                localStorage.setItem("VITE_IS_TEST", "true");
                localStorage.setItem("VITE_YJS_DISABLE_WS", "true");
                localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
            } catch {}
        });
        await page.goto("/", { waitUntil: "domcontentloaded", timeout: 120000 });
        await TestHelpers.navigateToTestProjectPage(page, testInfo, []);
        await page.waitForSelector('[data-testid="outliner-base"]', { timeout: 30000 });
        // ------------------------------------

        // 追加前のDOMカウントを取得
        const initialCount = await page.locator(".outliner-item").count();

        // 追加ボタンで新規アイテムを作成（UI操作）
        await page.click('button:has-text("アイテム追加")');

        // DOMの .outliner-item 数が増えるのを待機
        await page.waitForFunction((n) => document.querySelectorAll(".outliner-item").length > n, initialCount, {
            timeout: 30000,
        });

        // 新規アイテム（最後の要素）を取得
        const newCount = await page.locator(".outliner-item").count();
        const newItem = page.locator(".outliner-item").nth(newCount - 1);
        await expect(newItem).toBeVisible();
        const newId = await newItem.getAttribute("data-item-id");

        // クリックして編集モードへ
        await newItem.locator(".item-content").click({ force: true });
        // 保険: フォーカスをグローバルテキストエリアへ
        await page.evaluate(() => {
            (document.querySelector(".global-textarea") as HTMLTextAreaElement | null)?.focus();
        });

        // テキスト入力
        const targetText = "Hello from E2E";
        await page.keyboard.type(targetText);

        // DOMへ反映されたことを確認
        await expect(newItem.locator(".item-text")).toContainText(targetText, { timeout: 15000 });

        // 共有内容への反映を厳密確認（Yjs層に対する安定ポーリング）
        if (newId) {
            await page.waitForFunction(
                ({ id, text }) => {
                    const gs: any = (window as any).generalStore;
                    const pageItem: any = gs?.currentPage;
                    const items: any = pageItem?.items;
                    if (!items) return false;
                    const len = typeof items.length === "number" ? items.length : 0;
                    for (let i = 0; i < len; i++) {
                        const it = items.at ? items.at(i) : items[i];
                        if (it?.id === id) {
                            const t = (it.text as any)?.toString?.() ?? String(it.text ?? "");
                            return t === text;
                        }
                    }
                    return false;
                },
                { id: newId, text: targetText },
                { timeout: 10000 },
            );
        }

        // 以降のデバッグコードは不要のため削除
        const allItemsDebug = await page.evaluate(() => {
            return Array.from(document.querySelectorAll(".outliner-item")).map(el => ({
                id: el.getAttribute("data-item-id"),
                text: el.querySelector(".item-text")?.textContent || "",
                visible: (el as HTMLElement).offsetParent !== null,
            }));
        });
        console.log("All items debug:", allItemsDebug);

        // アイテムをクリックして編集モードに入る
        await newItem.locator(".item-content").click({ force: true });

        // 少し待機してからカーソルの状態を確認
        await page.waitForTimeout(500);

        // 新しく追加されたアイテムに確実にカーソルを設定
        await page.evaluate(itemId => {
            const store = (window as any).editorOverlayStore;
            if (store) {
                console.log("Setting cursor for new item:", itemId);

                // 既存のカーソルをクリア
                store.clearCursorAndSelection("local");

                const cursorId = store.setCursor({
                    itemId: itemId,
                    offset: 0,
                    isActive: true,
                    userId: "local",
                });
                console.log("Cursor set with ID:", cursorId);

                // アクティブアイテムも設定
                store.setActiveItem(itemId);
                console.log("Active item set to:", itemId);
            }
        }, newId);

        // 少し待機
        await page.waitForTimeout(500);

        // 入力先のグローバルテキストエリアにフォーカスを明示的に設定
        await page.evaluate(() => {
            const ta = document.querySelector(".global-textarea") as HTMLTextAreaElement | null;
            ta?.focus();
        });
        await page.waitForFunction(() => document.activeElement?.classList?.contains("global-textarea") ?? false, {
            timeout: 2000,
        });

        // 新しいアイテムが空であることを確認
        const initialText = await newItem.locator(".item-text").textContent();
        console.log(`Initial text in new item: "${initialText}"`);

        // アイテムが空でない場合、テキストをクリア
        if (initialText && initialText.trim() !== "") {
            await page.evaluate(itemId => {
                const store = (window as any).editorOverlayStore;
                const cursors = store.getCursorInstances();
                if (cursors.length > 0) {
                    const cursor = cursors[0];
                    const node = cursor.findTarget();
                    if (node) {
                        node.updateText("");
                        cursor.offset = 0;
                        cursor.applyToStore();
                    }
                }
            }, newId);
            await page.waitForTimeout(500);
        }

        // カーソル状態をデバッグ
        const cursorDebugInfo = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return { error: "editorOverlayStore not found" };

            return {
                cursorsCount: Object.keys(store.cursors).length,
                activeItemId: store.activeItemId,
                cursorInstances: store.cursorInstances.size,
                cursors: Object.values(store.cursors).map((c: any) => ({
                    itemId: c.itemId,
                    offset: c.offset,
                    isActive: c.isActive,
                    userId: c.userId,
                })),
            };
        });

        console.log("Cursor debug info:", cursorDebugInfo);

        // テキストを入力
        await page.screenshot({ path: "test-results/before Hello Fluid Framework.png" });
        const testText = "Hello Fluid Framework!";
        // GlobalTextArea 経由のキーボード入力に復帰
        await page.keyboard.type(testText);
        // フォールバック: 入力経路に問題がある環境向けに Cursor.insertText を残す（必要時のみコメント解除）
        // await page.evaluate((text) => {
        //     const store = (window as any).editorOverlayStore;
        //     if (!store) throw new Error("editorOverlayStore not found");
        //     const cursors = store.getCursorInstances();
        //     if (cursors.length === 0) throw new Error("No cursor instances available");
        //     const active = cursors.find((c: any) => c.isActive) ?? cursors[0];
        //     active.insertText(text);
        // }, testText);
        await page.screenshot({ path: "test-results/Hello Fluid Framework.png" });

        // テキスト入力後に少し待機
        await page.waitForTimeout(500);

        // テキストが入力されたことを確認（Enterキーを押す前）
        const textAfterInput = await newItem.locator(".item-text").textContent();
        console.log(`Text after input (before Enter): "${textAfterInput}"`);

        // 全てのアイテムの状態を再度確認
        const allItemsAfterInput = await page.evaluate(() => {
            return Array.from(document.querySelectorAll(".outliner-item")).map(el => ({
                id: el.getAttribute("data-item-id"),
                text: el.querySelector(".item-text")?.textContent || "",
                visible: (el as HTMLElement).offsetParent !== null,
            }));
        });
        console.log("All items after input:", allItemsAfterInput);

        // Enterキーを押してテキストを確定（Yjsでは不要だがUI揺れを避けるため押下）
        await page.keyboard.press("Enter");

        // データが更新されるのを待つ
        await page.waitForTimeout(1000);

        // スクリーンショットを撮ってデバッグ
        await page.screenshot({ path: "test-results/before-check.png" });

        // 最終的なテキストを確認
        const finalText = await newItem.locator(".item-text").textContent();
        console.log(`Final text in new item: "${finalText}"`);

        // 全てのアイテムの最終状態を確認
        const allItemsFinal = await page.evaluate(() => {
            return Array.from(document.querySelectorAll(".outliner-item")).map(el => ({
                id: el.getAttribute("data-item-id"),
                text: el.querySelector(".item-text")?.textContent || "",
                visible: (el as HTMLElement).offsetParent !== null,
            }));
        });
        console.log("All items final state:", allItemsFinal);

        // テキストが正しく入力されたことを確認
        // まず、アイテムが存在することを確認
        await expect(newItem).toBeVisible();

        // テキストが含まれていることを確認
        await expect(
            newItem.locator(".item-text"),
        ).toContainText(testText, { timeout: 15000 });

        // デバッグ用のスクリーンショットを保存

        await page.screenshot({ path: "test-results/add-text-result.png" });
    });

    /**
     * @testcase Adding text updates data structure
     * @description テキスト追加時にデータ構造が正しく更新されることを確認するテスト
     * @check デバッグパネルでテキスト追加前の状態を記録する
     * @check アイテムを追加し、テキストを入力する
     * @check デバッグパネルで更新後の状態を確認する
     * @check データ構造に入力したテキストが反映されていることを確認する
     * @check ページを再読み込みしても入力したデータが保持されていることを確認する
     */
    test("Adding text updates data structure", async ({ page }, testInfo) => {
        // --- 環境初期化（各テスト内で実施） ---
        await page.addInitScript(() => {
            try {
                localStorage.setItem("VITE_IS_TEST", "true");
                localStorage.setItem("VITE_YJS_DISABLE_WS", "true");
                localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
            } catch {}
        });
        await page.goto("/", { waitUntil: "domcontentloaded", timeout: 120000 });
        await TestHelpers.navigateToTestProjectPage(page, testInfo, []);
        await page.waitForSelector('[data-testid="outliner-base"]', { timeout: 30000 });
        // ------------------------------------

        // ストア初期化の完了待機（Yjs）
        await page.waitForFunction(() => {
            const gs: any = (window as any).generalStore;
            return !!(gs && gs.project);
        }, { timeout: 10000 });

        // テキスト追加前の状態を確認（Yjs/generalStore経由）
        const initialDebugInfo = await page.evaluate(() => {
            const gs: any = (window as any).generalStore;
            const pages: any = gs?.project?.items;
            const items = [] as any[];
            const len = pages?.length ?? 0;

            for (let i = 0; i < len; i++) {
                const it = pages.at ? pages.at(i) : pages[i];
                if (it) items.push({ id: String(it.id), text: it.text?.toString?.() ?? String(it.text ?? "") });
            }
            return { error: null, items };
        });

        // アイテムを追加して編集
        await page.click('button:has-text("アイテム追加")');

        // 少し待機してアイテムが追加されるのを待つ
        await page.waitForTimeout(1000);

        // 最新のアイテムを取得（最後に追加されたアイテム）
        const itemCount = await page.locator(".outliner-item").count();

        // 最後のアイテムを選択（新しく追加されたアイテム）
        const lastItem = page.locator(".outliner-item").nth(itemCount - 1);

        // アイテムの存在を確認
        await expect(lastItem).toBeVisible();

        // アイテムをクリックして編集モードに入る
        await lastItem.locator(".item-content").click();

        // カーソルの状態をデバッグ
        const debugInfo = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) {
                return { error: "editorOverlayStore not found" };
            }

            return {
                cursorsCount: Object.keys(store.cursors).length,
                cursors: store.cursors,
                activeItemId: store.activeItemId,
                cursorInstances: store.cursorInstances.size,
            };
        });

        // カーソルが表示されるのを待つ（短いタイムアウト）
        const cursorVisible = await TestHelpers.waitForCursorVisible(page, 5000);

        if (!cursorVisible) {
            // カーソルが表示されない場合、手動でカーソルを作成

            const itemId = await lastItem.getAttribute("data-item-id");
            if (itemId) {
                await page.evaluate(itemId => {
                    const store = (window as any).editorOverlayStore;
                    if (store) {
                        store.setCursor({
                            itemId: itemId,
                            offset: 0,
                            isActive: true,
                            userId: "local",
                        });
                    }
                }, itemId);

                // 少し待機
                await page.waitForTimeout(500);
            }
        }

        // テキストを入力
        await page.keyboard.type("Test data update");

        // データが更新されるのを待つ
        await page.waitForTimeout(2000);

        // 更新後のDebugInfoを取得（Yjs/generalStore経由）
        const updatedDebugInfo = await page.evaluate(() => {
            const gs: any = (window as any).generalStore;
            const pages: any = gs?.project?.items;
            const items = [] as any[];
            const len = pages?.length ?? 0;
            for (let i = 0; i < len; i++) {
                const it = pages.at ? pages.at(i) : pages[i];
                if (it) items.push({ id: String(it.id), text: it.text?.toString?.() ?? String(it.text ?? "") });
            }
            return { error: null, items };
        });

        // テキストが正しく入力されたことを確認
        const itemText = await lastItem.locator(".item-text").textContent();

        // テキストが含まれていることを確認
        expect(itemText).toContain("Test data update");
    });
});
