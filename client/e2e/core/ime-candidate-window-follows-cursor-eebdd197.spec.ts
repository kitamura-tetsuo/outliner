import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature IME-0002
 *  Title   : IME candidate window follows active cursor
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("IME-0002: IME candidate window follows active cursor", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("hidden textarea is positioned at cursor", async ({ page }) => {
        const item = page.locator(".outliner-item.page-title");
        if ((await item.count()) === 0) {
            const visibleItems = page
                .locator(".outliner-item")
                .filter({ hasText: /.*/ });
            await visibleItems
                .first()
                .locator(".item-content")
                .click({ force: true });
        } else {
            await item.locator(".item-content").click({ force: true });
        }

        const textarea = page.locator("textarea.global-textarea");
        await textarea.waitFor({ state: "visible" });
        await textarea.focus();

        // カーソルが表示されるのを待つ
        const cursorVisible = await TestHelpers.waitForCursorVisible(page);

        // カーソルが表示されない場合、手動でカーソルを設定
        if (!cursorVisible) {
            const itemId = await item.getAttribute("data-item-id");
            if (itemId) {
                await page.evaluate(itemId => {
                    // デバッグモードを有効にする
                    (window as any).DEBUG_MODE = true;

                    const store = (window as any).editorOverlayStore;
                    if (store) {
                        console.log("Setting cursor manually for IME test, item:", itemId);
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
                }, itemId);

                // 少し待機
                await page.waitForTimeout(500);
            }
        } else {
            // カーソルが表示されている場合もデバッグモードを有効にする
            await page.evaluate(() => {
                (window as any).DEBUG_MODE = true;
            });
        }

        // カーソルが設定されていない場合は、強制的に設定
        let hasValidCursor = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            return store && store.getLastActiveCursor() !== null;
        });

        if (!hasValidCursor) {
            // 最初のアイテムにカーソルを設定
            const firstItemId = await page.evaluate(() => {
                const firstItem = document.querySelector(".outliner-item");
                return firstItem ? firstItem.getAttribute("data-item-id") : null;
            });

            if (firstItemId) {
                await page.evaluate(itemId => {
                    const store = (window as any).editorOverlayStore;
                    if (store) {
                        console.log("Force setting cursor for IME test, item:", itemId);
                        const cursorId = store.setCursor({
                            itemId: itemId,
                            offset: 0,
                            isActive: true,
                            userId: "local",
                        });
                        console.log("Force cursor set with ID:", cursorId);

                        // アクティブアイテムも設定
                        store.setActiveItem(itemId);
                        console.log("Force active item set to:", itemId);

                        // カーソル点滅を開始
                        store.startCursorBlink();
                    }
                }, firstItemId);

                // 少し待機
                await page.waitForTimeout(500);

                // カーソルが正しく設定されたかを再確認
                hasValidCursor = await page.evaluate(() => {
                    const store = (window as any).editorOverlayStore;
                    const cursor = store ? store.getLastActiveCursor() : null;
                    console.log("Cursor verification:", cursor);
                    return !!cursor;
                });

                console.log("Cursor set successfully:", hasValidCursor);
            }
        }

        // デバッグモードを有効にして$effectの動作を確認
        await page.evaluate(() => {
            (window as any).DEBUG_MODE = true;
        });

        // 実装側でtextarea位置が自動更新されるのを待つ
        await page.waitForTimeout(500);

        // $effectが動作しているかを確認
        const effectDebugInfo = await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return { error: "store not found" };

            const lastCursor = store.getLastActiveCursor();
            const textareaRef = store.getTextareaRef();

            return {
                hasStore: !!store,
                hasTextarea: !!textareaRef,
                hasCursor: !!lastCursor,
                cursorInfo: lastCursor
                    ? {
                        itemId: lastCursor.itemId,
                        offset: lastCursor.offset,
                        isActive: lastCursor.isActive,
                    }
                    : null,
                textareaStyle: textareaRef
                    ? {
                        left: textareaRef.style.left,
                        top: textareaRef.style.top,
                        height: textareaRef.style.height,
                    }
                    : null,
            };
        });

        console.log("Effect debug info:", effectDebugInfo);

        const positions = await page.evaluate(() => {
            const cursor = document.querySelector(
                ".editor-overlay .cursor.active",
            ) as HTMLElement | null;
            const ta = document.querySelector(
                "textarea.global-textarea",
            ) as HTMLElement | null;
            if (!cursor || !ta) return null;
            const cursorRect = cursor.getBoundingClientRect();
            const taRect = ta.getBoundingClientRect();

            return {
                cursorLeft: cursorRect.left,
                cursorTop: cursorRect.top,
                taLeft: taRect.left,
                taTop: taRect.top,
            };
        });

        expect(positions).not.toBeNull();
        const { cursorLeft, cursorTop, taLeft, taTop } = positions!;

        console.log(`Position difference: left=${Math.abs(cursorLeft - taLeft)}, top=${Math.abs(cursorTop - taTop)}`);

        expect(Math.abs(cursorLeft - taLeft)).toBeLessThanOrEqual(2);
        expect(Math.abs(cursorTop - taTop)).toBeLessThanOrEqual(2);
    });
});
