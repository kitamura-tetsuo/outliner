/** @feature ITM-yjs-drag-reorder-a1b2c3d4
 *  Title   : Yjs Outliner - drag & drop でアイテムの並べ替え
 */
import { expect, test } from "@playwright/test";
import { waitForOutlinerItems } from "../helpers";

async function setItemTextByIndex(page, index: number, text: string) {
    // Outliner上のindexをデータモデルにマップ
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
        if (child && typeof child.updateText === "function") {
            child.updateText(text);
        }
    }, { index, text });
    // 反映待ち
    await page.waitForTimeout(150);
}

async function getItemIdByIndex(page, index: number): Promise<string> {
    const item = page.locator(".outliner-item").nth(index);
    return (await item.getAttribute("data-item-id"))!;
}

async function getItemTextByIndex(page, index: number): Promise<string> {
    const item = page.locator(".outliner-item").nth(index).locator(".item-text");
    await item.waitFor({ state: "visible" });
    return (await item.textContent()) || "";
}

test.describe("ITM-yjs-drag-reorder-a1b2c3d4: drag & drop reorder", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/yjs-outliner");
        await waitForOutlinerItems(page, 3, 5000);
    });

    test("2nd item dragged after 3rd (reorder)", async ({ page }) => {
        await waitForOutlinerItems(page, 4, 5000);

        // 先頭3つのテキストを設定
        await setItemTextByIndex(page, 0, "Item 1");
        await page.waitForTimeout(50);
        await setItemTextByIndex(page, 1, "Item 2");
        await page.waitForTimeout(50);
        await setItemTextByIndex(page, 2, "Item 3");

        const firstText = await getItemTextByIndex(page, 0);
        const secondText = await getItemTextByIndex(page, 1);
        const thirdText = await getItemTextByIndex(page, 2);

        expect(firstText).toContain("Item 1");
        expect(secondText).toContain("Item 2");
        expect(thirdText).toContain("Item 3");

        const secondId = await getItemIdByIndex(page, 1);
        const thirdId = await getItemIdByIndex(page, 2);

        const secondLocator = page.locator(`.outliner-item[data-item-id="${secondId}"] .item-content`);
        const thirdLocator = page.locator(`.outliner-item[data-item-id="${thirdId}"] .item-content`);

        await secondLocator.dragTo(thirdLocator);

        // 並び替え反映待ち
        await page.waitForTimeout(500);

        const movedText = await getItemTextByIndex(page, 2);
        expect(movedText.trim()).toBe("Item 2");
    });

    test("dragging item onto itself does not change order (no-op)", async ({ page }) => {
        await waitForOutlinerItems(page, 4, 5000);
        await setItemTextByIndex(page, 0, "Item 1");
        await setItemTextByIndex(page, 1, "Item 2");
        await setItemTextByIndex(page, 2, "Item 3");

        const before2 = await getItemTextByIndex(page, 1);
        const id2 = await getItemIdByIndex(page, 1);
        const loc2 = page.locator(`.outliner-item[data-item-id="${id2}"] .item-content`);
        await loc2.dragTo(loc2);
        await page.waitForTimeout(200);

        const after2 = await getItemTextByIndex(page, 1);
        expect(after2).toBe(before2);
    });
});
