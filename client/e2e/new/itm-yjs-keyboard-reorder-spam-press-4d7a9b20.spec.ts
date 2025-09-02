/** @feature ITM-yjs-keyboard-reorder-spam-press-4d7a9b20
 *  Title   : Yjs Outliner - Alt+矢印 連打安定性
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

async function getTexts(page): Promise<string[]> {
    const count = await page.locator(".outliner-item .item-text").count();
    const texts: string[] = [];
    for (let i = 0; i < count; i++) {
        texts.push(((await page.locator(".outliner-item").nth(i).locator(".item-text").textContent()) || "").trim());
    }
    return texts;
}

async function getActiveInfo(page) {
    return await page.evaluate(() => {
        const s: any = (window as any).editorOverlayStore;
        if (!s) return { active: 0, id: null };
        const active = Object.values(s.cursors || {}).filter((c: any) => c.isActive);
        return { active: active.length, id: s.activeItemId ?? null };
    });
}

test.describe("ITM-yjs-keyboard-reorder-spam-press-4d7a9b20: keyboard reorder spam press", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/yjs-outliner");
        await ensureOutlinerItemCount(page, 6, 12);
    });

    test("Alt+ArrowDown/Up を連続数回押下しても順序とアクティブが整合", async ({ page }) => {
        await waitForOutlinerItems(page, 6, 5000);
        await setItemTextByIndex(page, 0, "Title");
        await setItemTextByIndex(page, 1, "A");
        await setItemTextByIndex(page, 2, "B");
        await setItemTextByIndex(page, 3, "C");
        await setItemTextByIndex(page, 4, "D");
        await setItemTextByIndex(page, 5, "E");

        // B をアクティブ
        await page.locator(".outliner-item").nth(2).locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");

        const before = await getTexts(page);

        // 下方向へ3回
        for (let i = 0; i < 3; i++) await page.keyboard.press("Alt+ArrowDown");
        // 再設定の安定待ち（active=1 と B の位置）
        await page.waitForFunction(() => {
            const s: any = (window as any).editorOverlayStore;
            if (!s) return false;
            const act = Object.values(s.cursors || {}).filter((c: any) => c.isActive);
            return act.length === 1 && !!s.activeItemId;
        });
        await page.waitForFunction(() => {
            const texts = Array.from(
                document.querySelectorAll(".outliner-item .item-text"),
                el => (el.textContent || "").trim(),
            );
            return texts.slice(0, 6).join("|") === "Title|A|C|D|E|B";
        });
        // 上方向へ2回
        for (let i = 0; i < 2; i++) await page.keyboard.press("Alt+ArrowUp");
        await page.waitForFunction(() => {
            const s: any = (window as any).editorOverlayStore;
            if (!s) return false;
            const act = Object.values(s.cursors || {}).filter((c: any) => c.isActive);
            return act.length === 1 && !!s.activeItemId;
        });
        await page.waitForFunction(() => {
            const texts = Array.from(
                document.querySelectorAll(".outliner-item .item-text"),
                el => (el.textContent || "").trim(),
            );
            return texts.slice(0, 6).join("|") === "Title|A|C|B|D|E";
        });

        // 状態安定: rAF+timeoutで再設定する実装に追従
        await page.waitForFunction(() => {
            const s: any = (window as any).editorOverlayStore;
            if (!s) return false;
            const act = Object.values(s.cursors || {}).filter((c: any) => c.isActive);
            return act.length === 1 && !!s.activeItemId;
        });

        // 期待: B は 2つ下へ-> Eの手前, その後 2つ上へ -> C の位置に戻るので全体の相対順は A,C,B,D,E
        const texts = await getTexts(page);
        expect(texts.slice(0, 6)).toEqual(["Title", "A", "C", "B", "D", "E"]);

        // アクティブカーソルは1、かつ B の現在位置が active
        const info = await getActiveInfo(page);
        expect(info.active).toBe(1);
        const idxB = texts.findIndex(t => t === "B");
        const activeId = await page.locator(".outliner-item").nth(idxB).getAttribute("data-item-id");
        expect(info.id).toBe(activeId);

        // setCursor の遅延再設定が多重化していない（カーソル重複がない）
        const cursorCount = await page.evaluate(() => {
            const s: any = (window as any).editorOverlayStore;
            if (!s) return 0;
            return Object.values(s.cursors || {}).length;
        });
        expect(cursorCount).toBe(1);
    });

    test("タイトル行で Alt+Up/Down を高速交互押下しても不変性（順序不変・active=1）", async ({ page }) => {
        await waitForOutlinerItems(page, 6, 5000);
        await setItemTextByIndex(page, 0, "Title");
        await setItemTextByIndex(page, 1, "A");
        await setItemTextByIndex(page, 2, "B");
        await setItemTextByIndex(page, 3, "C");

        // タイトルをアクティブ
        await page.locator(".outliner-item").nth(0).locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");

        const before = await getTexts(page);

        // 高速交互押し
        for (let i = 0; i < 10; i++) {
            await page.keyboard.press("Alt+ArrowDown");
            await page.keyboard.press("Alt+ArrowUp");
        }

        // 安定待ち
        await page.waitForFunction(() => {
            const s: any = (window as any).editorOverlayStore;
            if (!s) return false;
            const act = Object.values(s.cursors || {}).filter((c: any) => c.isActive);
            return act.length === 1 && !!s.activeItemId;
        });

        const after = await getTexts(page);
        // 並び不変
        expect(after.slice(0, before.length)).toEqual(before);

        // active=1
        const info = await getActiveInfo(page);
        expect(info.active).toBe(1);
    });
});
