import { devices, expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
import { TouchGestures } from "../utils/touchGestures";

registerCoverageHooks();

test.use({ ...devices["Pixel 7"], hasTouch: true });

const ITEM_TEXT = "Hello World";

/** Waits for the seeded item to render and returns its text locator plus box. */
async function seedAndLocateItem(page: import("@playwright/test").Page, testInfo: { workerIndex?: number; }) {
    await TestHelpers.seedProjectAndNavigate(page, testInfo, [ITEM_TEXT]);
    await page.waitForSelector("text=Loading Page...", { state: "hidden", timeout: 10000 });

    const item = page.locator(`.outliner-item:not(.page-title):has-text("${ITEM_TEXT}")`).first();
    await expect(item).toBeVisible();

    const itemId = await item.getAttribute("data-item-id");
    expect(itemId).toBeTruthy();

    const textEl = item.locator(".item-text").first();
    await expect(textEl).toBeVisible();
    const box = await textEl.boundingBox();
    expect(box).not.toBeNull();

    return { item, itemId: itemId!, textEl, box: box! };
}

/**
 * Taps a point, first asserting it really resolves to the item text. The dev-only debug
 * button is a fixed overlay that can sit over an item's left edge, and a tap swallowed
 * by it would otherwise look like a broken caret.
 */
async function tapOnText(page: import("@playwright/test").Page, point: { x: number; y: number; }) {
    const hitClass = await page.evaluate(
        ([x, y]) => (document.elementFromPoint(x, y) as HTMLElement | null)?.className ?? "",
        [point.x, point.y],
    );
    expect(hitClass).toContain("item-text");

    await page.touchscreen.tap(point.x, point.y);
    await page.waitForTimeout(500);
}

test.describe("Mobile touch caret placement", () => {
    test("a tap at the end of the text places the caret there and focuses the textarea", async ({ page }, testInfo) => {
        const { itemId, box } = await seedAndLocateItem(page, testInfo);

        // Tap past the trailing edge of the text: the caret belongs at the end.
        await tapOnText(page, TouchGestures.pointInBox(box, 0.99));

        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.activeItemId).toBe(itemId);
        expect(cursorData.cursorCount).toBe(1);
        expect(cursorData.cursors[0].itemId).toBe(itemId);
        expect(cursorData.cursors[0].offset).toBe(ITEM_TEXT.length);

        // The keyboard only opens for a focus that happens inside the gesture handler.
        const focusedClass = await page.evaluate(() => document.activeElement?.className ?? "");
        expect(focusedClass).toContain("global-textarea");
    });

    test("a tap on a character places the caret at that character", async ({ page }, testInfo) => {
        const { itemId, textEl } = await seedAndLocateItem(page, testInfo);

        // The left third of "W" (index 6): the caret belongs before it.
        await tapOnText(page, await TouchGestures.pointInCharacter(textEl, 6));

        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.activeItemId).toBe(itemId);
        expect(cursorData.cursorCount).toBe(1);
        expect(cursorData.cursors[0].offset).toBe(6);
    });

    test("a tap produces exactly one cursor and no selection", async ({ page }, testInfo) => {
        const { box } = await seedAndLocateItem(page, testInfo);

        await tapOnText(page, TouchGestures.pointInBox(box, 0.99));

        // The browser's compatibility mouse events must not add a second cursor or
        // re-run the caret placement as a zero-length drag selection.
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursorCount).toBe(1);
        expect(cursorData.selectionCount).toBe(0);
    });

    test("typing after a tap inserts at the tapped position", async ({ page }, testInfo) => {
        const { item, box } = await seedAndLocateItem(page, testInfo);

        await tapOnText(page, TouchGestures.pointInBox(box, 0.99));

        await page.keyboard.type("!");
        await page.waitForTimeout(500);

        await expect(item.locator(".item-text").first()).toHaveText(ITEM_TEXT + "!");

        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursors[0].offset).toBe(ITEM_TEXT.length + 1);
    });
});
