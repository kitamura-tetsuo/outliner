import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, type Page, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

async function ids(page: Page): Promise<string[]> {
    return page.locator(".outliner-item[data-item-id]").evaluateAll(elements =>
        elements.map(element => element.getAttribute("data-item-id")!).slice(1)
    );
}

async function place(page: Page, itemId: string, offset: number): Promise<void> {
    await page.locator(`[data-item-id="${itemId}"] .item-content`).click({ force: true });
    await TestHelpers.focusGlobalTextarea(page);
    await page.keyboard.press("Home");
    for (let i = 0; i < offset; i += 1) await page.keyboard.press("ArrowRight");
}

async function expectCaret(page: Page, itemId: string, offset: number): Promise<void> {
    await expect.poll(async () => {
        const state = await CursorValidator.getCursorData(page);
        const instance = state.cursorInstances[0];
        const stored = state.cursors[0];
        return [
            state.cursorInstances.length,
            state.cursors.length,
            state.activeItemId,
            instance?.itemId,
            instance?.offset,
            stored?.itemId,
            stored?.offset,
        ];
    }).toEqual([1, 1, itemId, itemId, offset, itemId, offset]);
    await expect(page.locator("textarea.global-textarea")).toBeFocused();
    await expect(page.locator(".cursor")).toHaveCount(1);
}

test.describe("REQ-003/008: explicit actions reset the retained visual goal", () => {
    for (
        const reset of [
            { name: "Left", key: "ArrowLeft", expected: 2 },
            { name: "Right", key: "ArrowRight", expected: 3 },
            { name: "Home", key: "Home", expected: 0 },
            { name: "End", key: "End", expected: 3 },
            { name: "insertion", key: "Z", expected: 4 },
            { name: "Backspace", key: "Backspace", expected: 2 },
            { name: "Delete", key: "Delete", expected: 3 },
        ]
    ) {
        test(`${reset.name} recaptures X after a short-row clamp`, async ({ page }, testInfo) => {
            await TestHelpers.seedProjectAndNavigate(page, testInfo, ["abcdefghij", "xyz", "abcdefghij"]);
            const itemIds = await ids(page);
            await place(page, itemIds[0], 8);
            await page.keyboard.press("ArrowDown");
            await expectCaret(page, itemIds[1], 3);
            if (reset.name === "Right") await page.keyboard.press("ArrowLeft");
            await page.keyboard.press(reset.key);
            await page.keyboard.press("ArrowDown");
            await expectCaret(page, itemIds[2], reset.expected);
        });
    }

    test("same-item and cross-item pointer placements replace the old goal", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["abcdefghij", "xyz", "abcdefghij"]);
        const itemIds = await ids(page);
        await place(page, itemIds[0], 8);
        await page.keyboard.press("ArrowDown");
        await place(page, itemIds[1], 1);
        await page.keyboard.press("ArrowDown");
        await expectCaret(page, itemIds[2], 1);
        await place(page, itemIds[0], 2);
        await page.keyboard.press("ArrowDown");
        await expectCaret(page, itemIds[1], 2);
    });
});
