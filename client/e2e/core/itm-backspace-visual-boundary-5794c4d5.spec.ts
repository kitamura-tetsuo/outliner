import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

/** @feature ITM-5794de1e */
test.describe("ITM-5794de1e: Backspace visual boundary preservation", () => {
    async function pressBackspaceAtStart(page: Parameters<typeof TestHelpers.setCursor>[0], itemId: string) {
        await TestHelpers.focusGlobalTextarea(page);
        await TestHelpers.setCursor(page, itemId, 0);
        await expect.poll(async () => {
            const cursor = await CursorValidator.getCursorData(page);
            return [cursor.activeItemId, cursor.cursors.find(entry => entry.itemId === itemId)?.offset];
        }).toEqual([itemId, 0]);
        await page.keyboard.press("Backspace");
    }

    test("promotes a collapsed Layout's placements and synchronizes their metadata", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Before", "Layout", "After"]);
        const seeded = await page.evaluate(() => {
            const items = (globalThis as any).generalStore.currentPage.items;
            const layout = items.at(1);
            layout.componentType = "layout";
            layout.updateText("");
            const visual1 = layout.items.addNode("e2e");
            visual1.componentType = "yjstable";
            visual1.columnSpan = 4;
            const visual2 = layout.items.addNode("e2e");
            visual2.componentType = "calendar";
            visual2.columnSpan = 8;
            (globalThis as any).generalStore.activeViewModel.toggleCollapsed(layout.id);
            return {
                before: items.at(0).id,
                layout: layout.id,
                after: items.at(2).id,
                visual1: visual1.id,
                visual2: visual2.id,
            };
        });
        const peer = await page.context().newPage();
        await peer.goto(page.url());
        await TestHelpers.waitForOutlinerItems(peer);
        await expect.poll(async () =>
            peer.evaluate(
                id => [...(globalThis as any).generalStore.currentPage.items].some((item: any) => item.id === id),
                seeded.layout,
            )
        ).toBe(true);

        await pressBackspaceAtStart(page, seeded.after);

        const expected = {
            ids: [seeded.before, seeded.visual1, seeded.visual2, seeded.after],
            placements: [["yjstable", 4], ["calendar", 8]],
        };
        const readState = (target: typeof page) =>
            target.evaluate(() => {
                const items = [...(globalThis as any).generalStore.currentPage.items];
                return {
                    ids: items.map((item: any) => item.id),
                    placements: items.slice(1, 3).map((item: any) => [item.componentType, item.columnSpan]),
                };
            });
        expect(await readState(page)).toEqual(expected);
        await expect.poll(() => readState(peer)).toEqual(expected);
        const cursor = await CursorValidator.getCursorData(page);
        expect([cursor.activeItemId, cursor.cursors.find(entry => entry.itemId === seeded.after)?.offset]).toEqual([
            seeded.after,
            0,
        ]);
        await peer.close();
    });

    test("refuses visual removal when the surviving Text backing storage is missing", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Calendar", "After"]);
        const seeded = await page.evaluate(() => {
            const items = (globalThis as any).generalStore.currentPage.items;
            const visual = items.at(0);
            visual.componentType = "calendar";
            visual.updateText("");
            const text = items.at(1);
            text.yMap.delete("text");
            return { visual: visual.id, text: text.id };
        });
        await pressBackspaceAtStart(page, seeded.text);

        expect(
            await page.evaluate(() =>
                [...(globalThis as any).generalStore.currentPage.items].map((item: any) => item.id)
            ),
        )
            .toEqual([seeded.visual, seeded.text]);
        const cursor = await CursorValidator.getCursorData(page);
        expect([cursor.activeItemId, cursor.cursors.find(entry => entry.itemId === seeded.text)?.offset]).toEqual([
            seeded.text,
            0,
        ]);
    });
});
