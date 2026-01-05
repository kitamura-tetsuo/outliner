import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature ITM-yjs-keyboard-reorder-boundary-b2c4d8e1
 *  Title   : Yjs Outliner - Alt+矢印 並べ替えの境界ケース
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

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

async function getActiveCursorInfo(page) {
    return await page.evaluate(() => {
        const store = (window as any).editorOverlayStore;
        if (!store) return { activeCount: 0, activeItemId: null, total: 0 };
        const cursors = Object.values(store.cursors || {});
        const active = cursors.filter((c: any) => c.isActive);
        return { activeCount: active.length, activeItemId: store.activeItemId ?? null, total: cursors.length };
    });
}

test.describe("ITM-yjs-keyboard-reorder-boundary-b2c4d8e1: keyboard reorder boundary", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // Use standard test environment initialization with 4 items (title + 3 items)
        // Then add 1 more item via page.evaluate to get 5 total items
        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "Initial Item 1",
            "Initial Item 2",
            "Initial Item 3",
            "Initial Item 4",
        ]);

        await TestHelpers.waitForOutlinerItems(page, 5, 30000);
    });

    test("先頭/末尾では移動しない（並び不変・カーソルは1つ）", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page, 5, 30000);
        await setItemTextByIndex(page, 0, "Item 1");
        await setItemTextByIndex(page, 1, "A");
        await setItemTextByIndex(page, 2, "B");
        await setItemTextByIndex(page, 3, "C");
        await setItemTextByIndex(page, 4, "D");

        // 先頭直下( index 1: A ) をアクティブ
        await page.locator(".outliner-item").nth(1).locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");

        // Alt+ArrowUp: タイトルの上には移動できない -> 変化なし
        await page.keyboard.press("Alt+ArrowUp");
        await page.waitForFunction(() => {
            const s: any = (window as any).editorOverlayStore;
            if (!s) return false;
            const act = Object.values(s.cursors || {}).filter((c: any) => c.isActive);
            return act.length === 1;
        });
        expect(await getItemTextByIndex(page, 1)).toBe("A");

        // 末尾( index 4: D ) をアクティブ
        await page.locator(".outliner-item").nth(4).locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");

        // Alt+ArrowDown: 最下段からは下へ行けない -> 変化なし
        await page.keyboard.press("Alt+ArrowDown");
        await page.waitForFunction(() => {
            const s: any = (window as any).editorOverlayStore;
            if (!s) return false;
            const act = Object.values(s.cursors || {}).filter((c: any) => c.isActive);
            return act.length === 1;
        });
        expect(await getItemTextByIndex(page, 4)).toBe("D");

        // アクティブカーソルは1に保たれる
        const info = await getActiveCursorInfo(page);
        expect(info.activeCount).toBe(1);
    });

    test("タイトル(index 0) は移動対象外（押下しても並び不変・カーソル1）", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page, 5, 30000);
        await setItemTextByIndex(page, 0, "Item 1");
        await setItemTextByIndex(page, 1, "A");
        await setItemTextByIndex(page, 2, "B");

        // タイトルをアクティブ
        await page.locator(".outliner-item").nth(0).locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");

        // Alt+ArrowDown を押してもタイトルは移動しない
        const before1 = await getItemTextByIndex(page, 0);
        const before2 = await getItemTextByIndex(page, 1);
        await page.keyboard.press("Alt+ArrowDown");
        await page.waitForTimeout(200);
        expect(await getItemTextByIndex(page, 0)).toBe(before1);
        expect(await getItemTextByIndex(page, 1)).toBe(before2);

        const info = await getActiveCursorInfo(page);
        expect(info.activeCount).toBe(1);
    });

    test("複数カーソルがある境界押下でもアクティブは1に収束", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page, 5, 30000);
        await setItemTextByIndex(page, 0, "Item 1");
        await setItemTextByIndex(page, 1, "A");
        await setItemTextByIndex(page, 2, "B");

        // 末尾にアクティブを置く
        await page.locator(".outliner-item").nth(2).locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");

        // 下方向にカーソルを追加して2つにする
        await page.keyboard.press("Control+Shift+Alt+ArrowDown");
        await page.waitForTimeout(150);

        // さらに末尾で Alt+ArrowDown（境界）
        await page.locator(".outliner-item").nth(3).locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");
        await page.keyboard.press("Alt+ArrowDown");

        // 状態安定待ち
        await page.waitForFunction(() => {
            const s: any = (window as any).editorOverlayStore;
            if (!s) return false;
            const act = Object.values(s.cursors || {}).filter((c: any) => c.isActive);
            return act.length === 1;
        });

        const info = await getActiveCursorInfo(page);
        expect(info.activeCount).toBe(1);
    });

    test("末尾直前→末尾→末尾直前の往復で cursorHistory が破綻しない（active=1, lastHistory=active）", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page, 5, 30000);
        await setItemTextByIndex(page, 0, "Item 1");
        await setItemTextByIndex(page, 1, "A");
        await setItemTextByIndex(page, 2, "B");
        await setItemTextByIndex(page, 3, "C");
        await setItemTextByIndex(page, 4, "D");

        // 末尾直前( index 3: C ) をアクティブ
        await page.locator(".outliner-item").nth(3).locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");

        // 末尾へ移動（Alt+Down）→ 末尾直前へ戻る（Alt+Up）
        await page.keyboard.press("Alt+ArrowDown");
        await page.keyboard.press("Alt+ArrowUp");

        // 状態安定
        await page.waitForFunction(() => {
            const s: any = (window as any).editorOverlayStore;
            if (!s) return false;
            const act = Object.values(s.cursors || {}).filter((c: any) => c.isActive);
            return act.length === 1 && !!s.activeItemId;
        });

        // invariants
        const info = await getActiveCursorInfo(page);
        expect(info.activeCount).toBe(1);
        const state = await page.evaluate(() => {
            const s: any = (window as any).editorOverlayStore;
            const cursors = s.cursors as Record<string, any>;
            const active = Object.values(cursors).find((c: any) => c.isActive) as any | undefined;
            const lastHistory = s.cursorHistory?.[s.cursorHistory.length - 1];
            const activeId = active ? (active as any).cursorId : undefined;
            return { activeId, lastHistory } as { activeId?: string; lastHistory?: string; };
        });
        expect(state.lastHistory).toBe(state.activeId);
    });

    test("先頭直下→先頭直下→二重境界押下後も activeCount=1", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page, 5, 30000);
        await setItemTextByIndex(page, 0, "Item 1");
        await setItemTextByIndex(page, 1, "A");
        await setItemTextByIndex(page, 2, "B");

        // 先頭直下をアクティブ
        await page.locator(".outliner-item").nth(1).locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");

        // 境界で2回 Alt+Up
        await page.keyboard.press("Alt+ArrowUp");
        await page.keyboard.press("Alt+ArrowUp");

        await page.waitForFunction(() => {
            const s: any = (window as any).editorOverlayStore;
            if (!s) return false;
            const act = Object.values(s.cursors || {}).filter((c: any) => c.isActive);
            return act.length === 1;
        });
        const info2 = await getActiveCursorInfo(page);
        expect(info2.activeCount).toBe(1);
    });
});
