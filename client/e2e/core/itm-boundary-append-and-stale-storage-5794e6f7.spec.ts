import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

/** @feature ITM-5794de1e */
test.describe("ITM-5794de1e: append ordering and stale visual boundary storage", () => {
    async function pressAt(page: Parameters<typeof TestHelpers.setCursor>[0], id: string, offset: number, key: string) {
        await TestHelpers.focusGlobalTextarea(page);
        await TestHelpers.setCursor(page, id, offset);
        await expect.poll(async () => {
            const cursor = await CursorValidator.getCursorData(page);
            return [cursor.activeItemId, cursor.cursors.find(entry => entry.itemId === id)?.offset];
        }).toEqual([id, offset]);
        await page.keyboard.press(key);
    }

    test(
        "Backspace appends source children after a collapsed survivor's children and syncs",
        async ({ page }, info) => {
            await TestHelpers.seedProjectAndNavigate(page, info, ["Alpha", "Beta"]);
            const seeded = await page.evaluate(() => {
                const items = (globalThis as any).generalStore.currentPage.items;
                const a = items.at(0);
                const a1 = a.items.addNode("e2e");
                a1.updateText("A1");
                const a2 = a.items.addNode("e2e");
                a2.updateText("A2");
                const b = items.at(1);
                const b1 = b.items.addNode("e2e");
                b1.updateText("B1");
                b1.columnSpan = 7;
                const b1a = b1.items.addNode("e2e");
                b1a.updateText("B1a");
                const b2 = b.items.addNode("e2e");
                b2.updateText("B2");
                (globalThis as any).generalStore.activeViewModel.toggleCollapsed(a.id);
                return { a: a.id, b: b.id, a1: a1.id, a2: a2.id, b1: b1.id, b1a: b1a.id, b2: b2.id };
            });
            const peer = await page.context().newPage();
            await peer.goto(page.url());
            await TestHelpers.waitForOutlinerItems(peer);
            await expect.poll(() =>
                peer.evaluate(
                    id => [...(globalThis as any).generalStore.currentPage.items].some((item: any) => item.id === id),
                    seeded.b,
                )
            ).toBe(true);

            await pressAt(page, seeded.b, 0, "Backspace");

            const readState = (target: typeof page) =>
                target.evaluate((ids) => {
                    const items = (globalThis as any).generalStore.currentPage.items;
                    const a = [...items].find((item: any) => item.id === ids.a);
                    const b1 = [...a.items].find((item: any) => item.id === ids.b1);
                    return {
                        roots: [...items].map((item: any) => item.id),
                        text: String(a.text),
                        children: [...a.items].map((item: any) => item.id),
                        b1Children: [...b1.items].map((item: any) => item.id),
                        columnSpan: b1.columnSpan,
                    };
                }, seeded);
            const expected = {
                roots: [seeded.a],
                text: "AlphaBeta",
                children: [seeded.a1, seeded.a2, seeded.b1, seeded.b2],
                b1Children: [seeded.b1a],
                columnSpan: 7,
            };
            expect(await readState(page)).toEqual(expected);
            await expect.poll(() => readState(peer)).toEqual(expected);
            const cursor = await CursorValidator.getCursorData(page);
            expect([cursor.activeItemId, cursor.cursors.find(entry => entry.itemId === seeded.a)?.offset]).toEqual([
                seeded.a,
                5,
            ]);
            await peer.close();
        },
    );

    test("Delete refuses a visual neighbor when current text storage is a plain string", async ({ page }, info) => {
        await TestHelpers.seedProjectAndNavigate(page, info, ["Alpha", "Calendar"]);
        const seeded = await page.evaluate(() => {
            const items = (globalThis as any).generalStore.currentPage.items;
            const text = items.at(0);
            text.yMap.set("text", "Alpha");
            const visual = items.at(1);
            visual.componentType = "calendar";
            visual.updateText("");
            return { text: text.id, visual: visual.id };
        });
        await pressAt(page, seeded.text, 5, "Delete");

        const state = await page.evaluate(() => {
            const items = (globalThis as any).generalStore.currentPage.items;
            return { ids: [...items].map((item: any) => item.id), text: items.at(0).yMap.get("text") };
        });
        expect(state).toEqual({ ids: [seeded.text, seeded.visual], text: "Alpha" });
        const cursor = await CursorValidator.getCursorData(page);
        expect([cursor.activeItemId, cursor.cursors.find(entry => entry.itemId === seeded.text)?.offset]).toEqual([
            seeded.text,
            5,
        ]);
    });
});
