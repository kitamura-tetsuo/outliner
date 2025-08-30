/** @feature IND-yjs-tab-shifttab-indent-7ac4b2d9
 *  Title   : Yjs Outliner - Tab / Shift+Tab for indent and outdent (single and multi selection)
 */
import { expect, test } from "@playwright/test";
import { ensureOutlinerItemCount, waitForOutlinerItems } from "../helpers";

async function getDepth(page, itemId: string): Promise<number> {
    const sel = `.outliner-item[data-item-id="${itemId}"]`;
    await page.waitForSelector(sel);
    const attr = await page.locator(sel).getAttribute("data-depth");
    return Number(attr ?? "-1");
}

async function pressTab(page) {
    await page.keyboard.press("Tab");
}

async function pressShiftTab(page) {
    await page.keyboard.press("Shift+Tab");
}

test.describe("IND: Yjs Tab/Shift+Tab indent/outdent", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/yjs-outliner");
        await expect(page.locator('[data-testid="outliner-base"]').first()).toBeVisible();

        // 少なくともタイトル+子3が描画されるまで待機（場合によりボタンで増やす）
        await ensureOutlinerItemCount(page, 4, 10);
    });

    test("single item: Tab increases indent; Shift+Tab decreases", async ({ page }) => {
        // タイトル + 子3 の前提で index 2 のアイテム（2つ目の子）を対象
        await expect(page.locator(".outliner-item").nth(2)).toBeVisible();
        const target = page.locator(".outliner-item").nth(2);
        const targetId = await target.getAttribute("data-item-id");
        await target.locator(".item-text").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");

        const before = await getDepth(page, targetId!);
        await pressTab(page);
        await page.waitForTimeout(150);
        const after = await getDepth(page, targetId!);
        expect(after).toBe(before + 1);

        await pressShiftTab(page);
        await page.waitForTimeout(150);
        const afterOut = await getDepth(page, targetId!);
        expect(afterOut).toBe(after - 1);
    });

    test("multi selection: Tab indents all; Shift+Tab outdents all", async ({ page }) => {
        // index 2 と 3 を範囲選択
        await expect(page.locator(".outliner-item").nth(2)).toBeVisible();
        await expect(page.locator(".outliner-item").nth(3)).toBeVisible();
        const id2 = await page.locator(".outliner-item").nth(2).getAttribute("data-item-id");
        const id3 = await page.locator(".outliner-item").nth(3).getAttribute("data-item-id");

        await page.evaluate(({ startId, endId }) => {
            const s = (window as any).editorOverlayStore;
            s.clearSelections();
            s.setSelection({
                startItemId: startId,
                startOffset: 0,
                endItemId: endId,
                endOffset: 0,
                userId: "local",
                isReversed: false,
            });
        }, { startId: id2, endId: id3 });

        // フォーカスを明示してキーハンドラを確実に発火
        await page.focus("textarea.global-textarea");
        await page.waitForSelector("textarea.global-textarea:focus");

        // アクティブカーソルを設定（KeyEventHandler が early-return しないように）
        await page.evaluate((startId) => {
            (window as any).editorOverlayStore.setCursor({
                itemId: startId,
                offset: 0,
                isActive: true,
                userId: "local",
            });
        }, id2);

        const before2 = await getDepth(page, id2!);
        const before3 = await getDepth(page, id3!);

        await pressTab(page);

        // 深さが +1 になるまで待機（最大800ms）
        const waitDepth = async (id: string, expected: number) => {
            const start = Date.now();
            while (Date.now() - start < 800) {
                const d = await getDepth(page, id);
                if (d === expected) return d;
                await page.waitForTimeout(40);
            }
            return await getDepth(page, id);
        };

        const after2 = await waitDepth(id2!, before2 + 1);
        const after3 = await waitDepth(id3!, before3 + 1);

        // 片方が先に +1 になり、もう片方が遅延するケースを吸収
        const start = Date.now();
        while ((after2 !== before2 + 1 || after3 !== before3 + 1) && Date.now() - start < 1000) {
            await page.waitForTimeout(40);
            if (after2 !== before2 + 1) {
                const v = await getDepth(page, id2!);
                if (v === before2 + 1) {
                    // eslint-disable-next-line no-self-assign
                    const tmp = v; // keep
                }
            }
            if (after3 !== before3 + 1) {
                const v = await getDepth(page, id3!);
                if (v === before3 + 1) {
                    // eslint-disable-next-line no-self-assign
                    const tmp2 = v; // keep
                }
            }
            // 最新値を再取得
            const v2 = await getDepth(page, id2!);
            const v3 = await getDepth(page, id3!);
            if (v2 !== after2) after2 = v2;
            if (v3 !== after3) after3 = v3;
        }

        expect(after2).toBe(before2 + 1);
        expect(after3).toBe(before3 + 1);

        await pressShiftTab(page);

        const afterOut2 = await waitDepth(id2!, after2 - 1);
        const afterOut3 = await waitDepth(id3!, after3 - 1);
        expect(afterOut2).toBe(after2 - 1);
        expect(afterOut3).toBe(after3 - 1);
    });

    test("sequential: Tab -> Tab -> Shift+Tab adjusts depth deterministically", async ({ page }) => {
        // index 2 を対象に連続操作
        await expect(page.locator(".outliner-item").nth(2)).toBeVisible();
        const target = page.locator(".outliner-item").nth(2);
        const targetId = await target.getAttribute("data-item-id");
        await target.locator(".item-text").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");

        const d0 = await getDepth(page, targetId!);
        await pressTab(page); // +1
        await page.waitForTimeout(80);
        const d1 = await getDepth(page, targetId!);
        expect(d1).toBe(d0 + 1);

        await pressTab(page); // +1 or no-op（直前兄弟の子に前子がいない場合は +1 できない）
        await page.waitForTimeout(80);
        const d2 = await getDepth(page, targetId!);
        expect(d2 === d1 || d2 === d1 + 1).toBeTruthy();

        await pressShiftTab(page); // -1（直前の状態から1つ戻る）
        await page.waitForTimeout(80);
        const d3 = await getDepth(page, targetId!);
        expect(d3).toBe(d2 - 1);
    });
});
