/** @feature ITM-yjs-keyboard-reorder-multi-7a9c2ef1
 *  Title   : Yjs Outliner - マルチカーソルでのキーボード並べ替え（Alt+↑/↓）
 */
import { expect, test } from "@playwright/test";
import { ensureOutlinerItemCount, waitForOutlinerItems } from "../helpers";

async function setItemTextByIndex(page, index: number, text: string) {
    await page.evaluate(({ index, text }) => {
        const gs = (window as any).generalStore;
        if (!gs || !gs.currentPage) return;
        const pageItem = gs.currentPage;
        if (index === 0) {
            pageItem.updateText(text);
            return;
        }
        const childIndex = index - 1;
        const items = pageItem.items;
        const child = items?.at ? items.at(childIndex) : undefined;
        if (child && typeof child.updateText === "function") child.updateText(text);
    }, { index, text });
    await page.waitForTimeout(120);
}

async function getItemTextByIndex(page, index: number): Promise<string> {
    const item = page.locator(".outliner-item").nth(index).locator(".item-text");
    await item.waitFor({ state: "visible" });
    return (await item.textContent())?.trim() || "";
}

async function getItemIdByIndex(page, index: number): Promise<string> {
    const id = await page.locator(".outliner-item").nth(index).getAttribute("data-item-id");
    if (!id) throw new Error(`data-item-id not found at index ${index}`);
    return id;
}

async function getActiveCursorInfo(page) {
    return await page.evaluate(() => {
        const store = (window as any).editorOverlayStore;
        if (!store) return { activeCount: 0, activeItemId: null };
        const cursors = Object.values(store.cursors || {});
        const active = cursors.filter((c: any) => c.isActive);
        return { activeCount: active.length, activeItemId: store.activeItemId ?? null };
    });
}

test.describe("ITM-yjs-keyboard-reorder-multi-7a9c2ef1: keyboard reorder with multi-cursor", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/yjs-outliner");
        await ensureOutlinerItemCount(page, 5, 12);
    });

    test("Alt+ArrowDown: 2つのカーソルのうち最後に追加した方のアイテムだけが1つ下へ移動し、アクティブカーソルは1つに収束する", async ({ page }) => {
        await waitForOutlinerItems(page, 5, 5000);
        await setItemTextByIndex(page, 0, "Item 1");
        await setItemTextByIndex(page, 1, "A");
        await setItemTextByIndex(page, 2, "B");
        await setItemTextByIndex(page, 3, "C");
        await setItemTextByIndex(page, 4, "D");

        // 2番目(A)をアクティブに
        await page.locator(".outliner-item").nth(1).locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");

        // Ctrl+Shift+Alt+ArrowDown で 3番目(B) にカーソルを追加（最後に追加されたカーソル）
        await page.keyboard.press("Control+Shift+Alt+ArrowDown");
        await page.waitForFunction(() => {
            const s: any = (window as any).editorOverlayStore;
            if (!s) return false;
            return Object.values(s.cursors || {}).length >= 2;
        });

        // Alt+ArrowDown で "B" を1つ下へ移動（3番目 -> 4番目）
        await page.keyboard.press("Alt+ArrowDown");

        // ストア状態が安定するまで待機（アクティブカーソルが1つに収束）
        await page.waitForFunction(() => {
            const store: any = (window as any).editorOverlayStore;
            if (!store) return false;
            const active = Object.values(store.cursors || {}).filter((c: any) => c.isActive);
            return active.length === 1 && !!store.activeItemId;
        });

        const t2 = await getItemTextByIndex(page, 2); // 3番目のテキスト
        const t3 = await getItemTextByIndex(page, 3); // 4番目のテキスト
        expect(t2).toBe("C");
        expect(t3).toBe("B");

        // アクティブカーソルは1つに収束し、移動後のアイテムがアクティブ
        const movedId = await getItemIdByIndex(page, 3);
        const info = await getActiveCursorInfo(page);
        expect(info.activeCount).toBe(1);
        expect(info.activeItemId).toBe(movedId);
    });

    test("Alt+ArrowUp: 3つのカーソルのうち最後に追加した方のアイテムだけが1つ上へ移動し、アクティブカーソルは1つに収束する", async ({ page }) => {
        await waitForOutlinerItems(page, 5, 5000);
        await setItemTextByIndex(page, 0, "Item 1");
        await setItemTextByIndex(page, 1, "A");
        await setItemTextByIndex(page, 2, "B");
        await setItemTextByIndex(page, 3, "C");
        await setItemTextByIndex(page, 4, "D");

        // 2番目(A)をアクティブに
        await page.locator(".outliner-item").nth(1).locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");

        // 下方向に2回カーソル追加 => 3番目(B), 4番目(C) に追加され、最後は4番目(C)が最後に追加
        await page.keyboard.press("Control+Shift+Alt+ArrowDown");
        await page.waitForFunction(() => {
            const s: any = (window as any).editorOverlayStore;
            if (!s) return false;
            return Object.values(s.cursors || {}).length >= 2;
        });
        await page.keyboard.press("Control+Shift+Alt+ArrowDown");
        await page.waitForFunction(() => {
            const s: any = (window as any).editorOverlayStore;
            if (!s) return false;
            return Object.values(s.cursors || {}).length >= 3;
        });

        // Alt+ArrowUp で 最後に追加した "C" を1つ上へ（4番目 -> 3番目）
        await page.keyboard.press("Alt+ArrowUp");

        // ストア状態が安定するまで待機（アクティブカーソルが1つに収束）
        await page.waitForFunction(() => {
            const store: any = (window as any).editorOverlayStore;
            if (!store) return false;
            const active = Object.values(store.cursors || {}).filter((c: any) => c.isActive);
            return active.length === 1 && !!store.activeItemId;
        });

        const t2 = await getItemTextByIndex(page, 2); // 3番目
        const t3 = await getItemTextByIndex(page, 3); // 4番目
        expect(t2).toBe("C");
        expect(t3).toBe("B");

        const movedId = await getItemIdByIndex(page, 2);
        const info = await getActiveCursorInfo(page);
        expect(info.activeCount).toBe(1);
        expect(info.activeItemId).toBe(movedId);
    });
});
