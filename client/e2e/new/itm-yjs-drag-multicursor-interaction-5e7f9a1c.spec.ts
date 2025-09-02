/** @feature ITM-yjs-drag-multicursor-interaction-5e7f9a1c
 *  Title   : Yjs Outliner - マルチカーソル×Drag&Drop 相互作用
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

async function getItemIdByIndex(page, index: number): Promise<string> {
    const item = page.locator(".outliner-item").nth(index);
    return (await item.getAttribute("data-item-id"))!;
}

async function getTexts(page): Promise<string[]> {
    const els = page.locator(".outliner-item .item-text");
    const count = await els.count();
    const arr: string[] = [];
    for (let i = 0; i < count; i++) arr.push(((await els.nth(i).textContent()) || "").trim());
    return arr;
}

async function waitActiveCount(page, n = 1) {
    await page.waitForFunction((n) => {
        const s: any = (window as any).editorOverlayStore;
        if (!s) return false;
        const act = Object.values(s.cursors || {}).filter((c: any) => c.isActive);
        return act.length === n && (!!s.activeItemId || n === 0);
    }, n);
}

async function getActiveInfo(page) {
    return await page.evaluate(() => {
        const s: any = (window as any).editorOverlayStore;
        const cursors = Object.values(s.cursors || {});
        const active = cursors.filter((c: any) => c.isActive);
        const lastHistory = s.cursorHistory?.[s.cursorHistory.length - 1] ?? null;
        const activeId = (active[0] as any)?.cursorId ?? null;
        return { activeCount: active.length, lastHistory, activeId };
    });
}

test.describe("ITM-yjs-drag-multicursor-interaction-5e7f9a1c: multicursor × drag&drop", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/yjs-outliner");
        await expect(page.locator('[data-testid="outliner-base"]').first()).toBeVisible();
        await ensureOutlinerItemCount(page, 6, 10);
    });

    test("複数カーソル下でD&D後に active=1 かつ cursorHistory末尾=アクティブID", async ({ page }) => {
        await waitForOutlinerItems(page, 6, 5000);
        await setItemTextByIndex(page, 0, "Title");
        await setItemTextByIndex(page, 1, "A");
        await setItemTextByIndex(page, 2, "B");
        await setItemTextByIndex(page, 3, "C");

        // 1つ目のカーソル: A
        await page.locator(".outliner-item").nth(1).locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");

        // 2つ目のカーソルを下方向に追加（Ctrl+Shift+Alt+↓）
        await page.keyboard.press("Control+Shift+Alt+ArrowDown");
        await page.waitForFunction(() => {
            const s: any = (window as any).editorOverlayStore;
            if (!s) return false;
            return Object.values(s.cursors || {}).length >= 2;
        });

        // 選択範囲はクリア（アイテム移動のD&Dを確実に通すため）
        await page.evaluate(() => {
            const ed: any = (window as any).editorOverlayStore;
            if (!ed) return;
            if (typeof ed.clearSelections === "function") ed.clearSelections();
        });

        // C を B の上側へドラッグ（C->B top）
        const idB = await getItemIdByIndex(page, 2);
        const idC = await getItemIdByIndex(page, 3);
        const src = page.locator(`.outliner-item[data-item-id="${idC}"] .item-content`);
        const dst = page.locator(`.outliner-item[data-item-id="${idB}"] .item-content`);

        // 手動ドラッグ（dragToが要素に阻害されるケースの対策）
        // HTML5 DnD イベントを直接発火（DataTransfer を使う）
        await page.evaluate(({ srcSel, dstSel, srcId }) => {
            const src = document.querySelector(srcSel) as HTMLElement | null;
            const dst = document.querySelector(dstSel) as HTMLElement | null;
            if (!src || !dst) throw new Error("elements not found");
            const dt = new DataTransfer();
            dt.setData("application/x-outliner-item", srcId);
            dt.setData("text/plain", "");
            const startEv = new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt });
            src.dispatchEvent(startEv);
            const rect = dst.getBoundingClientRect();
            const clientX = rect.left + rect.width / 2;
            const clientY = rect.top + rect.height * 0.15; // top 付近
            dst.dispatchEvent(
                new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY }),
            );
            dst.dispatchEvent(
                new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY }),
            );
            dst.dispatchEvent(
                new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY }),
            );
        }, {
            srcSel: `.outliner-item[data-item-id="${idC}"] .item-content`,
            dstSel: `.outliner-item[data-item-id="${idB}"] .item-content`,
            srcId: idC,
        });

        // アクティブの安定待ち（最終的に1つに収束）
        await waitActiveCount(page, 1);

        const info = await getActiveInfo(page);
        expect(info.activeCount).toBe(1);
        expect(info.lastHistory).toBe(info.activeId);
    });

    test("ドロップ先が自分自身は no-op", async ({ page }) => {
        await waitForOutlinerItems(page, 5, 5000);
        await setItemTextByIndex(page, 1, "A");
        await setItemTextByIndex(page, 2, "B");

        const before = await getTexts(page);
        const id2 = await getItemIdByIndex(page, 2);
        const loc = page.locator(`.outliner-item[data-item-id="${id2}"] .item-content`);

        await loc.dragTo(loc);
        await waitActiveCount(page, 1).catch(() => {});

        const after = await getTexts(page);
        expect(after.slice(0, before.length)).toEqual(before);
    });

    test("先頭/末尾境界の無効ドロップは no-op", async ({ page }) => {
        await waitForOutlinerItems(page, 5, 5000);
        await setItemTextByIndex(page, 0, "Title");
        await setItemTextByIndex(page, 1, "A");
        await setItemTextByIndex(page, 2, "B");
        await setItemTextByIndex(page, 3, "C");

        const before = await getTexts(page);

        // 先頭(Title)へは実装上no-op想定: B->Title
        const idB = await getItemIdByIndex(page, 2);
        const idTitle = await getItemIdByIndex(page, 0);
        const srcB = page.locator(`.outliner-item[data-item-id="${idB}"] .item-content`);
        const dstTitle = page.locator(`.outliner-item[data-item-id="${idTitle}"] .item-content`);
        await srcB.dragTo(dstTitle);

        // 並びは変わらないことを確認
        await page.waitForFunction((expectStr) => {
            const texts = Array.from(
                document.querySelectorAll(".outliner-item .item-text"),
                el => (el.textContent || "").trim(),
            );
            return texts.slice(0, expectStr.length).join("|") === expectStr.join("|");
        }, before);
        // アクティブは1に収束
        await waitActiveCount(page, 1).catch(() => {});
    });
});
