import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

/** @feature ITM-5794de1e */
test.describe("ITM-5794de1e: boundary branches through real keys", () => {
    async function pressAt(
        page: Parameters<typeof TestHelpers.focusGlobalTextarea>[0],
        id: string,
        offset: number,
        key: string,
    ) {
        await TestHelpers.focusGlobalTextarea(page);
        await TestHelpers.setCursor(page, id, offset);
        await expect.poll(async () => (await CursorValidator.getCursorData(page)).cursors[0]?.offset).toBe(offset);
        await page.keyboard.press(key);
    }

    test("Delete merges a direct Text child and splices its descendants into its slot", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Alpha", "Beta"]);
        const seeded = await page.evaluate(() => {
            const items = (globalThis as any).generalStore.currentPage.items;
            const parent = items.at(0);
            const source = items.at(1);
            const child = source.items.addNode("e2e");
            child.updateText("Promoted");
            const after = parent.items.addNode("e2e");
            after.updateText("After");
            parent.tree.moveChildToParent(source.key, parent.key);
            parent.tree.setNodeBefore(source.key, after.key);
            parent.tree.recomputeParentsAndChildren();
            return { parent: parent.id, source: source.id, child: child.id, after: after.id };
        });
        await pressAt(page, seeded.parent, 5, "Delete");

        const state = await page.evaluate(() => {
            const pageItem = (globalThis as any).generalStore.currentPage;
            const parent = pageItem.items.at(0);
            return { text: String(parent.text), children: [...parent.items].map((item: any) => item.id) };
        });
        expect(state).toEqual({ text: "AlphaBeta", children: [seeded.child, seeded.after] });
        const cursor = await CursorValidator.getCursorData(page);
        expect([cursor.activeItemId, cursor.cursors[0]?.offset]).toEqual([seeded.parent, 5]);
    });

    for (const direction of ["Backspace", "Delete"] as const) {
        test(
            `${direction} removes an adjacent leaf visual without changing Text or caret`,
            async ({ page }, testInfo) => {
                await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Alpha", "Visual", "Z"]);
                const seeded = await page.evaluate((key) => {
                    const items = (globalThis as any).generalStore.currentPage.items;
                    const visual = items.at(1);
                    visual.componentType = "calendar";
                    visual.updateText("");
                    return { alpha: items.at(0).id, visual: visual.id, z: items.at(2).id, key };
                }, direction);
                const target = direction === "Backspace" ? seeded.z : seeded.alpha;
                const offset = direction === "Backspace" ? 0 : 5;
                await pressAt(page, target, offset, direction);

                const state = await page.evaluate(() => {
                    const items = (globalThis as any).generalStore.currentPage.items;
                    return [...items].map((item: any) => [item.id, String(item.text)]);
                });
                expect(state).toEqual([[seeded.alpha, "Alpha"], [seeded.z, "Z"]]);
                const cursor = await CursorValidator.getCursorData(page);
                expect([cursor.activeItemId, cursor.cursors[0]?.offset]).toEqual([target, offset]);
            },
        );
    }

    test(
        "empty Delete falls back to the previous Text and refuses when no safe target exists",
        async ({ page }, testInfo) => {
            await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Alpha", ""]);
            const ids = await page.evaluate(() => {
                const items = (globalThis as any).generalStore.currentPage.items;
                return { alpha: items.at(0).id, empty: items.at(1).id };
            });
            await pressAt(page, ids.empty, 0, "Delete");
            expect(
                await page.evaluate(() =>
                    [...(globalThis as any).generalStore.currentPage.items].map((i: any) => i.id)
                ),
            )
                .toEqual([ids.alpha]);
            let cursor = await CursorValidator.getCursorData(page);
            expect([cursor.activeItemId, cursor.cursors[0]?.offset]).toEqual([ids.alpha, 5]);

            await TestHelpers.seedProjectAndNavigate(page, testInfo, [""]);
            const only = await page.evaluate(() => (globalThis as any).generalStore.currentPage.items.at(0).id);
            await pressAt(page, only, 0, "Delete");
            expect(
                await page.evaluate(() =>
                    [...(globalThis as any).generalStore.currentPage.items].map((i: any) => i.id)
                ),
            )
                .toEqual([only]);
            cursor = await CursorValidator.getCursorData(page);
            expect([cursor.activeItemId, cursor.cursors[0]?.offset]).toEqual([only, 0]);
        },
    );
});
