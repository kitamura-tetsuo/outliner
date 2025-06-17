/** @feature ADV-0000 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("ADV-0000: advanced indent", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        const lines = [
            "アイテム 1",
            "アイテム 2",
            "アイテム 3",
            "アイテム 4",
            "アイテム 5",
        ];
        await TestHelpers.prepareTestEnvironment(page, testInfo, lines);
    });

    test("indent and unindent items", async ({ page }) => {
        const id2 = await TestHelpers.getItemIdByIndex(page, 1);
        await page.locator(`.outliner-item[data-item-id="${id2}"] .item-content`).click();
        await page.keyboard.press("Tab");

        let structure = await TestHelpers.getItemStructure(page);
        expect(structure[1].depth).toBe(1);

        const id3 = await TestHelpers.getItemIdByIndex(page, 2);
        await page.locator(`.outliner-item[data-item-id="${id3}"] .item-content`).click();
        await page.keyboard.press("Tab");
        await page.keyboard.press("Tab");

        structure = await TestHelpers.getItemStructure(page);
        expect(structure[2].depth).toBe(2);

        const id4 = await TestHelpers.getItemIdByIndex(page, 3);
        await page.locator(`.outliner-item[data-item-id="${id4}"] .item-content`).click();
        await page.keyboard.press("Tab");
        await page.keyboard.press("Tab");
        await page.keyboard.press("Tab");

        structure = await TestHelpers.getItemStructure(page);
        expect(structure[3].depth).toBe(3);

        const item4 = page.locator(`.outliner-item[data-item-id="${id4}"] .item-content`);
        for (let i = 0; i < 2; i++) {
            await item4.click();
            await page.keyboard.press("Shift+Tab");
        }

        const finalStructure = await TestHelpers.getItemStructure(page);
        const item4Final = finalStructure.find(it => it.text === "アイテム 4");
        expect(item4Final?.depth).toBe(1);
        expect(finalStructure.every((item, i) => i === 0 || item.top > finalStructure[i - 1].top)).toBe(true);
    });
});
