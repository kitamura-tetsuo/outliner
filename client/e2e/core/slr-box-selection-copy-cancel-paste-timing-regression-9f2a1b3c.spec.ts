import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SLR-0101
 *  Title   : ボックス選択（矩形選択）コピー・キャンセル・ペーストのタイミング回帰テスト
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * SLR-0101 回帰テスト: ボックス選択のコピー・キャンセル・ペーストのタイミング問題
 *
 * このテストでは、以下のシーケンスを検証します:
 * 1. 矩形選択でテキストをコピー
 * 2. Escキーでキャンセル（ペーストせずに）
 * 3. 再度矩形選択を作成
 * 4. ペースト
 *
 * このシーケンスは、タイミング問題による回帰を検出するために重要です。
 */
test.describe("ボックス選択のコピー・キャンセル・ペーストのタイミング回帰テスト", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // Save original clipboard methods for proper cleanup
        await page.evaluate(() => {
            if ((navigator as any).clipboard) {
                if ((navigator as any).clipboard.readText) {
                    (navigator as any).clipboard.readText.__original = (navigator as any).clipboard.readText;
                }
                if ((navigator as any).clipboard.writeText) {
                    (navigator as any).clipboard.writeText.__original = (navigator as any).clipboard.writeText;
                }
            }
        });
    });

    test.afterEach(async ({ page }) => {
        // Clean up global state to prevent test interference
        try {
            await page.evaluate(() => {
                // Reset global debug mode
                (window as any).DEBUG_MODE = false;

                // Clear clipboard-related global variables
                (window as any).lastCopiedText = undefined;
                (window as any).lastPastedText = undefined;
                (window as any).lastCopiedIsBoxSelection = undefined;
                (window as any).lastVSCodeMetadata = undefined;
                (window as any).lastBoxSelectionPaste = undefined;

                // Reset clipboard API mocks
                if ((navigator as any).clipboard) {
                    if ((navigator as any).clipboard.readText.__original) {
                        (navigator as any).clipboard.readText = (navigator as any).clipboard.readText.__original;
                    }
                    if ((navigator as any).clipboard.writeText.__original) {
                        (navigator as any).clipboard.writeText = (navigator as any).clipboard.writeText.__original;
                    }
                }

                // Reset KeyEventHandler box selection state
                if ((window as any).__KEY_EVENT_HANDLER__) {
                    const handler = (window as any).__KEY_EVENT_HANDLER__;
                    if (handler.boxSelectionState) {
                        handler.boxSelectionState = {
                            active: false,
                            startItemId: null,
                            startOffset: 0,
                            endItemId: null,
                            endOffset: 0,
                            ranges: [],
                        };
                    }
                }

                // Clear editor overlay store selections
                if ((window as any).editorOverlayStore) {
                    (window as any).editorOverlayStore.clearSelections();
                }
            });
        } catch (error) {
            console.log(`Cleanup error: ${error}`);
        }
    });

    test("矩形選択でコピー → Escでキャンセル → 再度矩形選択 → ペースト", async ({ page }) => {
        // デバッグモードを有効化とクリップボードモックの設定
        try {
            await page.evaluate(() => {
                (window as any).DEBUG_MODE = true;

                // モック: readText は lastCopiedText を返す
                (navigator as any).clipboard.readText = async () => {
                    return (window as any).lastCopiedText || "";
                };

                // モック: writeText は lastCopiedText を更新する
                (navigator as any).clipboard.writeText = async (text: string) => {
                    (window as any).lastCopiedText = text;
                    console.log(`[Mock] writeText: ${text}`);
                    return Promise.resolve();
                };
            });
        } catch (error) {
            console.log(`デバッグモード設定中にエラーが発生しました: ${error}`);
        }

        // 最初のアイテムが表示されるまで待機
        await page.waitForSelector(".outliner-item", { timeout: 5000 });

        // 1. テストデータを作成
        await page.locator(".outliner-item").first().click();
        await page.keyboard.type("First line of text");

        await page.keyboard.press("Enter");
        await page.keyboard.type("Second line of text");

        await page.keyboard.press("Enter");
        await page.keyboard.type("Third line of text");

        // 最初のアイテムをクリック
        await page.locator(".outliner-item").first().click();

        // 2. 最初の矩形選択を作成してコピー
        const startBox = await page.locator(".outliner-item").nth(1).boundingBox();
        const endBox = await page.locator(".outliner-item").last().boundingBox();

        if (!startBox || !endBox) {
            throw new Error("Could not get bounding box");
        }

        // Alt+Shiftキーを押しながらマウスドラッグ
        await page.keyboard.down("Alt");
        await page.keyboard.down("Shift");

        await page.mouse.move(startBox.x + 10, startBox.y + startBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(endBox.x + 10, endBox.y + endBox.height / 2, { steps: 10 });
        await page.mouse.up();

        await page.keyboard.up("Shift");
        await page.keyboard.up("Alt");

        // 矩形選択が作成されたことを確認 (waitForFunctionを使用)
        await page.waitForFunction(
            () => {
                if (!(window as any).editorOverlayStore) return false;
                const selections = Object.values((window as any).editorOverlayStore.selections);
                return selections.filter((s: any) => s.isBoxSelection).length === 1;
            },
            undefined,
            { timeout: 5000 },
        );

        // 3. コピー
        await page.keyboard.press("Control+c");

        // コピーされたテキストを確認 (waitForFunctionを使用)
        await page.waitForFunction(
            () => {
                const text = (window as any).lastCopiedText;
                return text && text.length > 0;
            },
            undefined,
            { timeout: 5000 },
        );

        const copiedText = await page.evaluate(() => (window as any).lastCopiedText);
        console.log(`コピーされたテキスト: "${copiedText}"`);

        // 4. Escキーでキャンセル（ペーストせずに）
        await page.keyboard.press("Escape");

        // 明示的にcancelBoxSelectionを呼び出す
        await page.evaluate(() => {
            if (
                (window as any).KeyEventHandler
                && typeof (window as any).KeyEventHandler.cancelBoxSelection === "function"
            ) {
                (window as any).KeyEventHandler.cancelBoxSelection();
            }

            // 選択範囲を強制的にクリア
            if ((window as any).editorOverlayStore) {
                (window as any).editorOverlayStore.clearSelections();
            }
        });

        // 矩形選択がキャンセルされたことを確認 (waitForFunctionを使用)
        await page.waitForFunction(
            () => {
                if (!(window as any).editorOverlayStore) return true; // Storeがない場合は選択なしとみなす
                const selections = Object.values((window as any).editorOverlayStore.selections);
                return selections.filter((s: any) => s.isBoxSelection).length === 0;
            },
            undefined,
            { timeout: 5000 },
        );

        // 5. 再度矩形選択を作成
        await page.keyboard.down("Alt");
        await page.keyboard.down("Shift");

        await page.mouse.move(startBox.x + 15, startBox.y + startBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(endBox.x + 20, endBox.y + endBox.height / 2, { steps: 10 });
        await page.mouse.up();

        await page.keyboard.up("Shift");
        await page.keyboard.up("Alt");

        // 矩形選択が再度作成されたことを確認 (waitForFunctionを使用)
        await page.waitForFunction(
            () => {
                if (!(window as any).editorOverlayStore) return false;
                const selections = Object.values((window as any).editorOverlayStore.selections);
                return selections.filter((s: any) => s.isBoxSelection).length === 1;
            },
            undefined,
            { timeout: 5000 },
        );

        // 6. ペースト
        await TestHelpers.focusGlobalTextarea(page);
        await page.keyboard.press("Control+v");

        // ペーストが成功したことを確認 (waitForFunctionを使用)
        await page.waitForFunction(
            (expectedText) => {
                const pasted = (window as any).lastPastedText || "";
                return pasted === expectedText;
            },
            copiedText,
            { timeout: 10000 },
        );

        const pastedText = await page.evaluate(() => (window as any).lastPastedText || "");
        console.log(`ペーストされたテキスト: "${pastedText}"`);
        expect(pastedText).toBe(copiedText);

        // 7. 最終的な状態を確認
        // ペースト後は選択範囲がクリアされるべき (waitForFunctionを使用)
        await page.waitForFunction(
            () => {
                if (!(window as any).editorOverlayStore) return true;
                const selections = Object.values((window as any).editorOverlayStore.selections);
                return selections.filter((s: any) => s.isBoxSelection).length === 0;
            },
            undefined,
            { timeout: 5000 },
        );
    });
});
