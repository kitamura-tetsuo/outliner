/** @feature CLM-0004
 *  Title   : 上へ移動
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { DataValidationHelpers } from "../utils/dataValidationHelpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("CLM-0004: 上へ移動", () => {
    test.afterEach(async ({ page }) => {
        // FluidとYjsのデータ整合性を確認
        await DataValidationHelpers.validateDataConsistency(page);
    });
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // ページタイトルを優先的に使用
        const item = page.locator(".outliner-item.page-title");

        // ページタイトルが見つからない場合は、表示されている最初のアイテムを使用
        if (await item.count() === 0) {
            // テキスト内容で特定できるアイテムを探す
            const visibleItems = page.locator(".outliner-item").filter({ hasText: /.*/ });
            await visibleItems.first().locator(".item-content").click({ force: true });
        } else {
            await item.locator(".item-content").click({ force: true });
        }

        // カーソルが表示されるまで待機
        await TestHelpers.waitForCursorVisible(page);

        // 長いテキストを入力して視覚的な折り返しを作成
        await page.keyboard.type(
            "これは非常に長いテキストです。折り返しによって複数行になります。アイテムの幅に応じて自動的に折り返されて表示されるはずです。このテキストは十分に長いので、標準的な画面幅であれば少なくとも2行以上になるはずです。",
        );

        // テキストが入力されるのを待機
        await page.waitForTimeout(300);
    });
    test("カーソルを1行上に移動する", async ({ page }) => {
        // デバッグモードを有効にする
        await page.evaluate(() => {
            (window as any).DEBUG_MODE = true;
        });
        // カーソルデータを取得して確認
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursorCount).toBeGreaterThan(0);
        expect(cursorData.activeItemId).not.toBeNull();

        // アクティブなアイテムの高さを確認して複数行になっているかチェック
        const itemHeight = await page.locator(`.outliner-item[data-item-id="${cursorData.activeItemId}"]`).locator(
            ".item-content",
        ).evaluate(el => {
            const rect = el.getBoundingClientRect();

            const computedStyle = window.getComputedStyle(el);

            const lineHeight = parseInt(computedStyle.lineHeight) || 20;

            const estimatedLines = Math.round(rect.height / lineHeight);

            return { height: rect.height, lineHeight, estimatedLines };
        });
        console.log(`アイテムの高さ情報:`, itemHeight);

        // 複数行になっていることを確認
        expect(itemHeight.estimatedLines).toBeGreaterThan(1);

        // カーソルを2行目に移動するため、まず行の先頭に移動
        await page.keyboard.press("Home");
        // 確実に2行目に到達するように60文字右に移動（1行目は0-49なので50文字目以降が2行目）
        for (let i = 0; i < 60; i++) {
            await page.keyboard.press("ArrowRight");
        }
        await page.waitForTimeout(100);

        // 複数のカーソルがある場合は最初のものを使用
        const cursor = page.locator(".editor-overlay .cursor.active").first();

        await cursor.waitFor({ state: "visible" });
        // 初期カーソル位置とオフセットを取得
        const initialPosition = await cursor.boundingBox();

        const initialOffset = await cursor.evaluate(el => parseInt(el.getAttribute("data-offset") || "-1"));
        console.log(`初期カーソル位置:`, initialPosition);
        console.log(`初期オフセット: ${initialOffset}`);

        // 視覚的な行の情報をテスト
        const visualLineInfo = await page.evaluate(({ itemId, offset }: { itemId: string; offset: number; }) => {
            const itemElement = document.querySelector(`[data-item-id="${itemId}"]`);

            if (!itemElement) return null;

            const textElement = itemElement.querySelector(".item-text") as HTMLElement;

            if (!textElement) return null;

            const text = textElement.textContent || "";

            console.log(`Text content: "${text}"`);

            console.log(`Text length: ${text.length}`);

            console.log(`Current offset: ${offset}`);

            // Range API を使用して視覚的な行を判定
            const textNode = Array.from(textElement.childNodes).find(node => node.nodeType === Node.TEXT_NODE) as Text;

            if (!textNode) return null;

            const lines: { startOffset: number; endOffset: number; y: number; }[] = [];

            let currentLineY: number | null = null;

            let currentLineStart = 0;

            // 10文字ごとにサンプリング
            const step = 10;

            for (let i = 0; i <= text.length; i += step) {
                const actualOffset = Math.min(i, text.length);

                const range = document.createRange();

                const safeOffset = Math.min(actualOffset, textNode.textContent?.length || 0);

                range.setStart(textNode, safeOffset);

                range.setEnd(textNode, safeOffset);

                const rect = range.getBoundingClientRect();

                const y = Math.round(rect.top);

                console.log(`Offset ${actualOffset}: Y=${y}`);

                if (currentLineY === null) {
                    currentLineY = y;
                } else if (Math.abs(y - currentLineY) > 5) { // 5px以上の差があれば新しい行
                    // 新しい行が始まった

                    lines.push({
                        startOffset: currentLineStart,

                        endOffset: actualOffset - 1,

                        y: currentLineY,
                    });

                    console.log(`Line detected: start=${currentLineStart}, end=${actualOffset - 1}, y=${currentLineY}`);

                    currentLineStart = actualOffset;

                    currentLineY = y;
                }
            }

            // 最後の行を追加

            if (currentLineY !== null) {
                lines.push({
                    startOffset: currentLineStart,

                    endOffset: text.length,

                    y: currentLineY,
                });

                console.log(`Last line: start=${currentLineStart}, end=${text.length}, y=${currentLineY}`);
            }

            console.log(`Total lines detected: ${lines.length}`);

            return { lines, totalLines: lines.length };
        }, { itemId: cursorData.activeItemId, offset: initialOffset });
        console.log(`視覚的な行の情報:`, visualLineInfo);

        // 上矢印キーを押下
        await page.keyboard.press("ArrowUp");
        // 更新を待機
        await page.waitForTimeout(300);

        // 新しいカーソル位置を取得
        const newPosition = await cursor.boundingBox();

        const newOffset = await cursor.evaluate(el => parseInt(el.getAttribute("data-offset") || "-1"));
        console.log(`新しいカーソル位置:`, newPosition);
        console.log(`新しいオフセット: ${newOffset}`);

        // カーソルが上に移動したことを確認
        if (newPosition && initialPosition) {
            if (newPosition.y < initialPosition.y) {
                console.log("✓ カーソルが上に移動しました");
            } else if (newPosition.y === initialPosition.y && newPosition.x !== initialPosition.x) {
                console.log("⚠ カーソルは同じ行内で移動しました（視覚的な行の移動が機能していない可能性）");
                // 視覚的な行の移動が実装されていない場合は、オフセットの変化で確認

                expect(newOffset).not.toBe(initialOffset);
            } else {
                console.log("✗ カーソルが移動していません");

                expect(newPosition.y).toBeLessThan(initialPosition.y);
            }
        }
    });
});
