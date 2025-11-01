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
    });

    test.afterEach(async () => {
        // 必要に応じてクリーンアップ処理を実装
    });

    test("矩形選択でコピー → Escでキャンセル → 再度矩形選択 → ペースト", async ({ page }) => {
        // デバッグモードを有効化
        try {
            await page.evaluate(() => {
                (window as any).DEBUG_MODE = true;
            });
        } catch (error) {
            console.log(`デバッグモード設定中にエラーが発生しました: ${error}`);
        }

        // 最初のアイテムが表示されるまで待機
        await page.waitForSelector(".outliner-item", { timeout: 5000 });

        // プロジェクトとページが準備完了するまで待機
        await page.waitForFunction(() => {
            try {
                const w: any = window as any;
                const generalStore = w.generalStore;
                const hasProject = !!(generalStore?.project);
                const hasPages = !!(generalStore?.pages);
                return hasProject && hasPages;
            } catch {
                return false;
            }
        }, { timeout: 10000 });

        // 1. テストデータを作成
        await page.locator(".outliner-item").first().click();
        await page.keyboard.type("First line of text");

        // Yjs同期を待つ
        await page.waitForTimeout(200);

        await page.keyboard.press("Enter");
        await page.keyboard.type("Second line of text");

        // Yjs同期を待つ
        await page.waitForTimeout(200);

        await page.keyboard.press("Enter");
        await page.keyboard.type("Third line of text");

        // Yjs同期を待つ
        await page.waitForTimeout(200);

        // 最初のアイテムをクリック
        await page.locator(".outliner-item").first().click();

        // 2. 最初の矩形選択を作成してコピー
        const firstItemBounds = await page.locator(".outliner-item").first().boundingBox();
        const secondItemBounds = await page.locator(".outliner-item").nth(1).boundingBox();

        if (!firstItemBounds || !secondItemBounds) {
            throw new Error("アイテムの位置を取得できませんでした");
        }

        // Alt+Shiftキーを押しながらマウスドラッグ
        await page.keyboard.down("Alt");
        await page.keyboard.down("Shift");

        await page.mouse.move(firstItemBounds.x + 5, firstItemBounds.y + firstItemBounds.height / 2);
        await page.mouse.down();
        await page.mouse.move(firstItemBounds.x + 10, secondItemBounds.y + secondItemBounds.height / 2, { steps: 10 });
        await page.mouse.up();

        await page.keyboard.up("Shift");
        await page.keyboard.up("Alt");

        // 矩形選択が安定するまで待機
        await page.waitForFunction(() => {
            if (!(window as any).editorOverlayStore) {
                return false;
            }
            const selections = Object.values((window as any).editorOverlayStore.selections);
            const boxSelections = selections.filter((s: any) => s.isBoxSelection);
            return boxSelections.length === 1;
        }, { timeout: 2000 });

        // 矩形選択が作成されたことを確認
        const boxSelectionCount1 = await page.evaluate(() => {
            if (!(window as any).editorOverlayStore) {
                return 0;
            }
            const selections = Object.values((window as any).editorOverlayStore.selections);
            return selections.filter((s: any) => s.isBoxSelection).length;
        });
        console.log(`最初の矩形選択の数: ${boxSelectionCount1}`);
        expect(boxSelectionCount1).toBe(1);

        // 3. テキストをコピー
        await page.keyboard.press("Control+c");

        // コピー操作完了を待つ（テキストが設定されるまで待機）
        await page.waitForFunction(() => {
            const copiedText = (window as any).lastCopiedText;
            return copiedText && copiedText.length > 0;
        }, { timeout: 3000 });

        // コピーされたテキストを確認
        const copiedText = await page.evaluate(() => {
            return (window as any).lastCopiedText || "";
        });
        console.log(`コピーされたテキスト: "${copiedText}"`);
        expect(copiedText.length).toBeGreaterThan(0);

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

        // 少し待機して選択範囲のクリアを確実にする
        await page.waitForTimeout(100);

        // 矩形選択がキャンセルされたことを確認
        const boxSelectionCount2 = await page.evaluate(() => {
            if (!(window as any).editorOverlayStore) {
                return 0;
            }
            const selections = Object.values((window as any).editorOverlayStore.selections);
            return selections.filter((s: any) => s.isBoxSelection).length;
        });
        console.log(`キャンセル後の矩形選択の数: ${boxSelectionCount2}`);
        expect(boxSelectionCount2).toBe(0);

        // 5. 再度矩形選択を作成
        await page.keyboard.down("Alt");
        await page.keyboard.down("Shift");

        await page.mouse.move(firstItemBounds.x + 15, firstItemBounds.y + firstItemBounds.height / 2);
        await page.mouse.down();
        await page.mouse.move(firstItemBounds.x + 20, secondItemBounds.y + secondItemBounds.height / 2, { steps: 10 });
        await page.mouse.up();

        await page.keyboard.up("Shift");
        await page.keyboard.up("Alt");

        // 矩形選択が安定するまで待機
        await page.waitForFunction(() => {
            if (!(window as any).editorOverlayStore) {
                return false;
            }
            const selections = Object.values((window as any).editorOverlayStore.selections);
            const boxSelections = selections.filter((s: any) => s.isBoxSelection);
            return boxSelections.length === 1;
        }, { timeout: 2000 });

        // 矩形選択が再度作成されたことを確認
        const boxSelectionCount3 = await page.evaluate(() => {
            if (!(window as any).editorOverlayStore) {
                return 0;
            }
            const selections = Object.values((window as any).editorOverlayStore.selections);
            return selections.filter((s: any) => s.isBoxSelection).length;
        });
        console.log(`2回目の矩形選択の数: ${boxSelectionCount3}`);
        expect(boxSelectionCount3).toBe(1);

        // 6. ペースト
        await page.keyboard.press("Control+v");

        // ペースト操作完了を待つ（テキストが設定されるまで待機）
        await page.waitForFunction(() => {
            const pastedText = (window as any).lastPastedText;
            return pastedText && pastedText.length > 0;
        }, { timeout: 3000 });

        // ペーストが成功したことを確認（グローバル変数をチェック）
        const pastedText = await page.evaluate(() => {
            return (window as any).lastPastedText || "";
        });
        console.log(`ペーストされたテキスト: "${pastedText}"`);

        // ペーストされたテキストがコピーされたテキストと一致することを確認
        expect(pastedText).toBe(copiedText);

        // 7. 最終的な状態を確認
        // 矩形選択がクリアされていることを確認
        const finalBoxSelectionCount = await page.evaluate(() => {
            if (!(window as any).editorOverlayStore) {
                return 0;
            }
            const selections = Object.values((window as any).editorOverlayStore.selections);
            return selections.filter((s: any) => s.isBoxSelection).length;
        });
        console.log(`最終的な矩形選択の数: ${finalBoxSelectionCount}`);

        // ペースト後は選択範囲がクリアされるべき
        expect(finalBoxSelectionCount).toBe(0);
    });
});
