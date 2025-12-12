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
        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "First line of text",
            "Second line of text",
            "Third line of text",
        ]);

        await page.evaluate(() => {
            (window as any).DEBUG_MODE = true;
            (window as any).lastCopiedText = undefined;
            (window as any).lastPastedText = undefined;
            (window as any).lastVSCodeMetadata = undefined;
            (window as any).lastBoxSelectionPaste = undefined;
        });
    });

    test.afterEach(async ({ page }) => {
        await page.evaluate(() => {
            (window as any).DEBUG_MODE = false;
            (window as any).lastCopiedText = undefined;
            (window as any).lastPastedText = undefined;
            (window as any).lastVSCodeMetadata = undefined;
            (window as any).lastBoxSelectionPaste = undefined;

            const handler = (window as any).__KEY_EVENT_HANDLER__;
            if (handler?.cancelBoxSelection) handler.cancelBoxSelection();

            const eos = (window as any).editorOverlayStore;
            if (eos?.clearSelections) eos.clearSelections();
        });
    });

    test("矩形選択でコピー → Escでキャンセル → 再度矩形選択 → ペースト", async ({ page }) => {
        await page.waitForSelector(".outliner-item", { timeout: 5000 });
        await page.waitForFunction(
            () => document.querySelectorAll(".outliner-item").length >= 3,
            { timeout: 5000 },
        );

        await page.locator(".outliner-item").first().click();
        await TestHelpers.focusGlobalTextarea(page);

        // 2. 最初の矩形選択を作成してコピー
        const startItem = page.locator(".outliner-item").nth(1);
        const endItem = page.locator(".outliner-item").last();
        await startItem.scrollIntoViewIfNeeded();
        await endItem.scrollIntoViewIfNeeded();

        const startBox = await startItem.boundingBox();
        const endBox = await endItem.boundingBox();

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

        // 3. テキストをコピー
        await TestHelpers.focusGlobalTextarea(page);
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
        await TestHelpers.focusGlobalTextarea(page);
        await page.keyboard.press("Escape");

        await page.evaluate(() => {
            const handler = (window as any).__KEY_EVENT_HANDLER__;
            if (handler?.cancelBoxSelection) handler.cancelBoxSelection();
        });

        // 矩形選択がキャンセルされたことを確認 (waitForFunctionを使用)
        await page.waitForFunction(
            () => {
                const handler = (window as any).__KEY_EVENT_HANDLER__;
                const stateOk = handler?.boxSelectionState?.active ? false : true;
                const eos = (window as any).editorOverlayStore;
                if (!eos) return stateOk;
                const selections = Object.values(eos.selections);
                const storeOk = selections.filter((s: any) => s.isBoxSelection).length === 0;
                return stateOk && storeOk;
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
        await page.evaluate((text) => {
            const textarea = document.querySelector(".global-textarea") as HTMLTextAreaElement | null;
            if (!textarea) throw new Error("global textarea not found");
            const dt = new DataTransfer();
            dt.setData("text/plain", text);
            const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
            textarea.dispatchEvent(ev);
        }, copiedText);

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
                const handler = (window as any).__KEY_EVENT_HANDLER__;
                const stateOk = handler?.boxSelectionState?.active ? false : true;
                const eos = (window as any).editorOverlayStore;
                if (!eos) return stateOk;
                const selections = Object.values(eos.selections);
                const storeOk = selections.filter((s: any) => s.isBoxSelection).length === 0;
                return stateOk && storeOk;
            },
            undefined,
            { timeout: 5000 },
        );
    });
});
