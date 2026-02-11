import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature ITM-yjs-keyboard-reorder-boundary-b2c4d8e1
 *  Title   : Yjs Outliner - Alt+Arrow Reorder Boundary Cases
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

    test("Does not move at start/end (order unchanged, single cursor)", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page, 5, 30000);
        await setItemTextByIndex(page, 0, "Item 1");
        await setItemTextByIndex(page, 1, "A");
        await setItemTextByIndex(page, 2, "B");
        await setItemTextByIndex(page, 3, "C");
        await setItemTextByIndex(page, 4, "D");

        // Activate item immediately below title (index 1: A)
        await page.locator(".outliner-item").nth(1).locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");

        // Alt+ArrowUp: Cannot move above title -> No change
        await page.keyboard.press("Alt+ArrowUp");
        await page.waitForFunction(() => {
            const s: any = (window as any).editorOverlayStore;
            if (!s) return false;
            const act = Object.values(s.cursors || {}).filter((c: any) => c.isActive);
            return act.length === 1;
        });
        expect(await getItemTextByIndex(page, 1)).toBe("A");

        // Activate last item (index 4: D)
        await page.locator(".outliner-item").nth(4).locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");

        // Alt+ArrowDown: Cannot move below bottom -> No change
        await page.keyboard.press("Alt+ArrowDown");
        await page.waitForFunction(() => {
            const s: any = (window as any).editorOverlayStore;
            if (!s) return false;
            const act = Object.values(s.cursors || {}).filter((c: any) => c.isActive);
            return act.length === 1;
        });
        expect(await getItemTextByIndex(page, 4)).toBe("D");

        // Active cursor count is maintained at 1
        const info = await getActiveCursorInfo(page);
        expect(info.activeCount).toBe(1);
    });

    test("Title (index 0) is excluded from movement (order unchanged even if pressed, single cursor)", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page, 5, 30000);
        await setItemTextByIndex(page, 0, "Item 1");
        await setItemTextByIndex(page, 1, "A");
        await setItemTextByIndex(page, 2, "B");

        // Activate title
        await page.locator(".outliner-item").nth(0).locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");

        // Pressing Alt+ArrowDown does not move the title
        const before1 = await getItemTextByIndex(page, 0);
        const before2 = await getItemTextByIndex(page, 1);
        await page.keyboard.press("Alt+ArrowDown");
        await page.waitForTimeout(200);
        expect(await getItemTextByIndex(page, 0)).toBe(before1);
        expect(await getItemTextByIndex(page, 1)).toBe(before2);

        const info = await getActiveCursorInfo(page);
        expect(info.activeCount).toBe(1);
    });

    test("Active cursor count converges to 1 even when pressing boundary with multiple cursors", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page, 5, 30000);
        await setItemTextByIndex(page, 0, "Item 1");
        await setItemTextByIndex(page, 1, "A");
        await setItemTextByIndex(page, 2, "B");

        // Place active cursor at the end
        await page.locator(".outliner-item").nth(2).locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");

        // Add cursor downwards to make it 2
        await page.keyboard.press("Control+Shift+Alt+ArrowDown");
        await page.waitForTimeout(150);

        // Further Alt+ArrowDown at the end (boundary)
        await page.locator(".outliner-item").nth(3).locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");
        await page.keyboard.press("Alt+ArrowDown");

        // Wait for state stability
        await page.waitForFunction(() => {
            const s: any = (window as any).editorOverlayStore;
            if (!s) return false;
            const act = Object.values(s.cursors || {}).filter((c: any) => c.isActive);
            return act.length === 1;
        });

        const info = await getActiveCursorInfo(page);
        expect(info.activeCount).toBe(1);
    });

    test("Round trip from second to last -> last -> second to last does not break cursorHistory (active=1, lastHistory=active)", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page, 5, 30000);
        await setItemTextByIndex(page, 0, "Item 1");
        await setItemTextByIndex(page, 1, "A");
        await setItemTextByIndex(page, 2, "B");
        await setItemTextByIndex(page, 3, "C");
        await setItemTextByIndex(page, 4, "D");

        // Activate second to last item (index 3: C)
        await page.locator(".outliner-item").nth(3).locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");

        // Move to end (Alt+Down) -> Return to second to last (Alt+Up)
        await page.keyboard.press("Alt+ArrowDown");
        await page.keyboard.press("Alt+ArrowUp");

        // State stable
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

    test("activeCount=1 even after pressing double boundary at second item", async ({ page }) => {
        await TestHelpers.waitForOutlinerItems(page, 5, 30000);
        await setItemTextByIndex(page, 0, "Item 1");
        await setItemTextByIndex(page, 1, "A");
        await setItemTextByIndex(page, 2, "B");

        // Activate item immediately below title
        await page.locator(".outliner-item").nth(1).locator(".item-content").click({ force: true });
        await page.waitForSelector("textarea.global-textarea:focus");

        // Alt+Up twice at boundary
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
