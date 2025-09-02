/** @feature ITM-yjs-drop-external-text-9f8e7d6c
 *  Title   : Yjs Outliner - 外部テキストドロップの挿入
 */
import { expect, test } from "@playwright/test";
import { ensureOutlinerItemCount } from "../helpers";

async function getItemTextByIndex(page, index: number): Promise<string> {
    const item = page.locator(".outliner-item").nth(index).locator(".item-text");
    await item.waitFor({ state: "visible" });
    return (await item.textContent()) || "";
}

test.describe("ITM (Yjs): drop external text", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/yjs-outliner");
        await expect(page.locator('[data-testid="outliner-base"]').first()).toBeVisible();
        await ensureOutlinerItemCount(page, 3, 10);
    });

    test("drop multi-line text at top inserts lines and creates new items", async ({ page }) => {
        // 1番目アイテムのテキストを取得
        const before0 = (await getItemTextByIndex(page, 0)).trim();

        // 外部テキストを生成（2行）
        const data = "AAA\nBBB";

        // 1番目アイテムの表示領域へドロップ
        const target = page.locator(".outliner-item").nth(0).locator(".item-content");
        // ページコンテキストで DataTransfer を生成し dragenter/dragover/drop を発火
        await target.evaluate((el, txt) => {
            const dt = new DataTransfer();
            dt.setData("text/plain", txt as string);
            const rect = (el as HTMLElement).getBoundingClientRect();
            const topY = rect.top + 2; // ほぼ上部
            el.dispatchEvent(new DragEvent("dragenter", { clientY: topY, dataTransfer: dt }));
            el.dispatchEvent(new DragEvent("dragover", { clientY: topY, dataTransfer: dt }));
            el.dispatchEvent(new DragEvent("drop", { clientY: topY, dataTransfer: dt }));
        }, data);

        await page.waitForTimeout(300);

        // 1行目は先頭結合、2行目は新規アイテムとして入ることを確認
        const after0 = (await getItemTextByIndex(page, 0)).trim();

        // 1行目は先頭結合
        expect(after0.startsWith("AAA")).toBeTruthy();

        // 2行目 "BBB" の新規アイテムがどこかに存在すること（位置は既存子の有無に依存）
        const texts = await page.locator(".outliner-item .item-text").allTextContents();
        expect(texts.map(t => t.trim())).toContain("BBB");

        // 先頭の元テキストを壊していないこと（先頭結合なので、末尾側に元文字が含まれる）
        if (before0.length > 0) {
            expect(after0.includes(before0)).toBeTruthy();
        }
    });
});
