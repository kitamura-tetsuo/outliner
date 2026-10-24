import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, type Page, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { TestHelpers } from "../utils/testHelpers";

async function itemIds(page: Page): Promise<string[]> {
    return page.locator(".outliner-item[data-item-id]").evaluateAll(elements =>
        elements.map(element => element.getAttribute("data-item-id")!).slice(1)
    );
}

async function modelText(page: Page): Promise<string[]> {
    return page.locator(".outliner-item[data-item-id] .item-text").allTextContents();
}

async function place(page: Page, itemId: string, offset: number): Promise<void> {
    await page.locator(`[data-item-id="${itemId}"] .item-content`).click({ force: true });
    await TestHelpers.focusGlobalTextarea(page);
    await page.keyboard.press("Home");
    for (let index = 0; index < offset; index += 1) await page.keyboard.press("ArrowRight");
    await expect(page.locator("textarea.global-textarea")).toBeFocused();
}

async function assertCaret(page: Page, itemId: string, offset: number): Promise<void> {
    await expect.poll(async () => {
        const data = await CursorValidator.getCursorData(page);
        const local = data.cursorInstances.filter((cursor: any) => (cursor.userId ?? "local") === "local");
        const stored = data.cursors.filter((cursor: any) => (cursor.userId ?? "local") === "local");
        return {
            activeItemId: data.activeItemId,
            instanceCount: local.length,
            instanceItemId: local[0]?.itemId,
            instanceOffset: local[0]?.offset,
            storedCount: stored.length,
            storedItemId: stored[0]?.itemId,
            storedOffset: stored[0]?.offset,
        };
    }).toEqual({
        activeItemId: itemId,
        instanceCount: 1,
        instanceItemId: itemId,
        instanceOffset: offset,
        storedCount: 1,
        storedItemId: itemId,
        storedOffset: offset,
    });
    await expect(page.locator("textarea.global-textarea")).toBeFocused();
    await expect(page.locator(".cursor")).toHaveCount(1);
}

test.describe("REQ-007: retained visual goal through short and empty rows", () => {
    test("Down and Up restore the no-edit goal through a short row", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["abcdefghij", "x", "abcdefghij"]);
        const ids = await itemIds(page);
        expect(ids).toHaveLength(3);
        const before = await modelText(page);

        await place(page, ids[0], 8);
        await page.keyboard.press("ArrowDown");
        await assertCaret(page, ids[1], 1);
        await page.keyboard.press("ArrowDown");
        await assertCaret(page, ids[2], 8);

        await place(page, ids[2], 8);
        await page.keyboard.press("ArrowUp");
        await assertCaret(page, ids[1], 1);
        await page.keyboard.press("ArrowUp");
        await assertCaret(page, ids[0], 8);
        expect(await modelText(page)).toEqual(before);
    });

    test("Down and Up retain the goal through two consecutive empty rows", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["abcdefghij", "", "", "abcdefghij"]);
        const ids = await itemIds(page);
        expect(ids).toHaveLength(4);
        const before = await modelText(page);

        await place(page, ids[0], 7);
        for (const [id, offset] of [[ids[1], 0], [ids[2], 0], [ids[3], 7]] as const) {
            await page.keyboard.press("ArrowDown");
            await assertCaret(page, id, offset);
        }
        for (const [id, offset] of [[ids[2], 0], [ids[1], 0], [ids[0], 7]] as const) {
            await page.keyboard.press("ArrowUp");
            await assertCaret(page, id, offset);
        }
        expect(await modelText(page)).toEqual(before);
    });

    test("a fresh empty origin uses its own start X rather than destination EOL", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["", "abcdefghij"]);
        const ids = await itemIds(page);
        const before = await modelText(page);
        await place(page, ids[0], 0);
        await page.keyboard.press("ArrowDown");
        await assertCaret(page, ids[1], 0);
        expect(await modelText(page)).toEqual(before);
    });
});
