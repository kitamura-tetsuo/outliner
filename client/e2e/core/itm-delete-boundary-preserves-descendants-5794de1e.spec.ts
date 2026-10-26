import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

/** @feature ITM-5794de1e */
test.describe("ITM-5794de1e: Delete boundary descendant preservation", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Alpha", "Beta", "Z"]);
        await TestHelpers.waitForOutlinerItems(page);
    });

    test("nonempty Delete merges the next Text and retains its nested subtree", async ({ page }) => {
        const seeded = await page.evaluate(() => {
            const items = (globalThis as any).generalStore.currentPage.items;
            const a = items.at(0);
            const b = items.at(1);
            const child = b.items.addNode("e2e");
            child.updateText("Child");
            const grandchild = child.items.addNode("e2e");
            grandchild.updateText("Grandchild");
            return { a: a.id, b: b.id, z: items.at(2).id, child: child.id, grandchild: grandchild.id };
        });

        await page.locator(`.outliner-item[data-item-id="${seeded.b}"] .collapse-btn`).click();
        await expect(page.locator(`.outliner-item[data-item-id="${seeded.child}"]`)).toBeHidden();

        const peer = await page.context().newPage();
        await peer.goto(page.url());
        await TestHelpers.waitForOutlinerItems(peer);
        await expect.poll(async () =>
            peer.evaluate(id => {
                const items = (globalThis as any).generalStore.currentPage?.items;
                return [...items].some((item: any) => item.id === id);
            }, seeded.b)
        ).toBe(true);

        await TestHelpers.focusGlobalTextarea(page);
        await TestHelpers.setCursor(page, seeded.a, 5);
        await expect.poll(async () => (await CursorValidator.getCursorData(page)).cursors[0]?.offset).toBe(5);
        await page.keyboard.press("Delete");

        const state = await page.evaluate((ids) => {
            const items = (globalThis as any).generalStore.currentPage.items;
            const a = [...items].find((item: any) => item.id === ids.a);
            return {
                roots: [...items].map((item: any) => item.id),
                text: String(a.text),
                children: [...a.items].map((item: any) => item.id),
                grandchildren: [...a.items.at(0).items].map((item: any) => item.id),
            };
        }, seeded);
        expect(state).toEqual({
            roots: [seeded.a, seeded.z],
            text: "AlphaBeta",
            children: [seeded.child],
            grandchildren: [seeded.grandchild],
        });
        const cursor = await CursorValidator.getCursorData(page);
        expect(cursor.activeItemId).toBe(seeded.a);
        expect(cursor.cursors).toHaveLength(1);
        expect(cursor.cursors[0].offset).toBe(5);
        await expect.poll(async () =>
            peer.evaluate((ids) => {
                const items = (globalThis as any).generalStore.currentPage.items;
                const a = [...items].find((item: any) => item.id === ids.a);
                return {
                    roots: [...items].map((item: any) => item.id),
                    text: String(a.text),
                    children: [...a.items].map((item: any) => item.id),
                    grandchildren: [...a.items.at(0).items].map((item: any) => item.id),
                };
            }, seeded)
        ).toEqual({
            roots: [seeded.a, seeded.z],
            text: "AlphaBeta",
            children: [seeded.child],
            grandchildren: [seeded.grandchild],
        });
        await peer.close();
    });

    test("Delete removes a child-bearing Layout but preserves its placements and caret", async ({ page }) => {
        const seeded = await page.evaluate(() => {
            const items = (globalThis as any).generalStore.currentPage.items;
            const a = items.at(0);
            const layout = items.at(1);
            layout.componentType = "layout";
            layout.updateText("");
            const visual1 = layout.items.addNode("e2e");
            visual1.componentType = "yjstable";
            visual1.columnSpan = 4;
            const visual2 = layout.items.addNode("e2e");
            visual2.componentType = "calendar";
            visual2.columnSpan = 8;
            return { a: a.id, layout: layout.id, z: items.at(2).id, visual1: visual1.id, visual2: visual2.id };
        });

        await TestHelpers.focusGlobalTextarea(page);
        await TestHelpers.setCursor(page, seeded.a, 5);
        await expect.poll(async () => (await CursorValidator.getCursorData(page)).cursors[0]?.offset).toBe(5);
        await page.keyboard.press("Delete");

        const state = await page.evaluate(() => {
            const items = (globalThis as any).generalStore.currentPage.items;
            return [...items].map((item: any) => ({
                id: item.id,
                text: String(item.text),
                componentType: item.componentType,
                columnSpan: item.columnSpan,
            }));
        });
        expect(state.map(item => item.id)).toEqual([seeded.a, seeded.visual1, seeded.visual2, seeded.z]);
        expect(state[0].text).toBe("Alpha");
        expect(state.slice(1, 3).map(item => [item.componentType, item.columnSpan])).toEqual([
            ["yjstable", 4],
            ["calendar", 8],
        ]);
        const cursor = await CursorValidator.getCursorData(page);
        expect(cursor.activeItemId).toBe(seeded.a);
        expect(cursor.cursors).toHaveLength(1);
        expect(cursor.cursors[0].offset).toBe(5);
    });

    test("missing destination text makes a real Backspace a complete no-op", async ({ page }) => {
        const seeded = await page.evaluate(() => {
            const items = (globalThis as any).generalStore.currentPage.items;
            const a = items.at(0);
            const b = items.at(1);
            const child = b.items.addNode("e2e");
            child.updateText("Child");
            a.yMap.delete("text");
            return { a: a.id, b: b.id, z: items.at(2).id, child: child.id };
        });
        await TestHelpers.focusGlobalTextarea(page);
        await TestHelpers.setCursor(page, seeded.b, 0);
        await expect.poll(async () => (await CursorValidator.getCursorData(page)).activeItemId).toBe(seeded.b);
        await page.keyboard.press("Backspace");

        const state = await page.evaluate(() => {
            const items = (globalThis as any).generalStore.currentPage.items;
            return {
                roots: [...items].map((item: any) => item.id),
                secondText: String(items.at(1).text),
                secondChildren: [...items.at(1).items].map((item: any) => item.id),
            };
        });
        expect(state).toEqual({
            roots: [seeded.a, seeded.b, seeded.z],
            secondText: "Beta",
            secondChildren: [seeded.child],
        });
        const cursor = await CursorValidator.getCursorData(page);
        expect(cursor.activeItemId).toBe(seeded.b);
        expect(cursor.cursors).toHaveLength(1);
        expect(cursor.cursors[0].offset).toBe(0);
    });
});
