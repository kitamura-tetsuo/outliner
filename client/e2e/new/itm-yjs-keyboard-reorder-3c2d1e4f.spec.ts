/** @feature ITM-yjs-keyboard-reorder-3c2d1e4f
 *  Title   : Yjs Outliner - キーボードでの並べ替え（Alt+↑/↓）
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

async function getActiveCursorInfo(page: import("@playwright/test").Page) {
    return await page.evaluate(() => {
        const store = (window as any).editorOverlayStore;
        if (!store) return { activeCount: 0, activeItemId: null };
        const cursors = Object.values(store.cursors || {});
        const active = cursors.filter((c: any) => c.isActive);
        return { activeCount: active.length, activeItemId: store.activeItemId ?? null };
    });
}

test.describe("ITM (Yjs): keyboard reorder", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/yjs-outliner");
        await ensureOutlinerItemCount(page, 3, 10);
    });

    test("Alt+ArrowDown で 2番目を 3番目の位置へ移動", async ({ page }) => {
        await waitForOutlinerItems(page, 4, 5000);
        await setItemTextByIndex(page, 0, "Item 1");
        await setItemTextByIndex(page, 1, "Item 2");
        await setItemTextByIndex(page, 2, "Item 3");

        // 2番目をアクティブにして textarea にフォーカス
        await page.locator(".outliner-item").nth(1).locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");

        // Alt+下で下へ
        await page.keyboard.press("Alt+ArrowDown");
        await page.waitForTimeout(400);

        // 3番目のテキストが Item 2 になっている
        const text2 = await getItemTextByIndex(page, 2);
        expect(text2).toBe("Item 2");
    });

    test("Alt+ArrowUp で 3番目を 2番目の位置へ移動", async ({ page }) => {
        await waitForOutlinerItems(page, 4, 5000);
        await setItemTextByIndex(page, 0, "Item 1");
        await setItemTextByIndex(page, 1, "Item 2");
        await setItemTextByIndex(page, 2, "Item 3");

        // 3番目をアクティブ
        await page.locator(".outliner-item").nth(2).locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");

        // Alt+上で上へ
        await page.keyboard.press("Alt+ArrowUp");
        await page.waitForTimeout(400);

        // 2番目のテキストが Item 3 になっている
        const text1 = await getItemTextByIndex(page, 1);
        expect(text1).toBe("Item 3");
    });
});
