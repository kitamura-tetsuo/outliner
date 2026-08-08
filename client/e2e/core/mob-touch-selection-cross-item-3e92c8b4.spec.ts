import { devices, expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
import { TouchGestures } from "../utils/touchGestures";

registerCoverageHooks();

test.use({ ...devices["Pixel 7"], hasTouch: true });

// Scrapbox formatting: the rendered text hides the control characters, so a DOM-derived
// offset would be 9 ("Bold second line") where the raw model offset is 20. The drag must
// report the raw offset.
const ABOVE_TEXT = "[[Bold]] second line";
// What the item renders while it is not being edited: the control characters are hidden.
const ABOVE_RENDERED_TEXT = "Bold second line";
const PRESSED_TEXT = "Hello World";
// Offset of "World" inside PRESSED_TEXT; a long press snaps to the word's start.
const WORD_START = 6;

test.describe("Mobile touch selection across items", () => {
    test("dragging into the item above extends the selection across both items", async ({ page }, testInfo) => {
        // A trailing item keeps the pressed one clear of the end of the outline.
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [ABOVE_TEXT, PRESSED_TEXT, "Filler tail"]);
        await page.waitForSelector("text=Loading Page...", { state: "hidden", timeout: 10000 });

        const aboveItem = page.locator(`.outliner-item:not(.page-title):has-text("${ABOVE_RENDERED_TEXT}")`).first();
        const pressedItem = page.locator(`.outliner-item:not(.page-title):has-text("${PRESSED_TEXT}")`).first();
        await expect(aboveItem).toBeVisible();
        await expect(pressedItem).toBeVisible();

        const aboveItemId = await aboveItem.getAttribute("data-item-id");
        const pressedItemId = await pressedItem.getAttribute("data-item-id");
        expect(aboveItemId).toBeTruthy();
        expect(pressedItemId).toBeTruthy();

        const pressedBox = await pressedItem.locator(".item-text").first().boundingBox();
        expect(pressedBox).not.toBeNull();

        await TouchGestures.longPressAndDrag(
            page,
            TouchGestures.pointInBox(pressedBox!, 0.8),
            // Measured after the long press: entering edit mode scrolls the caret into
            // view, so the item above is not where it was when the press started.
            async () => {
                const aboveBox = await aboveItem.locator(".item-text").first().boundingBox();
                expect(aboveBox).not.toBeNull();
                // A single move, landing past the trailing edge of the text above, so the
                // selection is decided while that item is still rendered with its control
                // characters hidden. A second move would first make the item active, and
                // an active item renders its raw text -- which would mask an offset taken
                // from the DOM instead of the model.
                return [{ x: aboveBox!.x + aboveBox!.width * 0.99, y: aboveBox!.y + aboveBox!.height / 2 }];
            },
        );
        await page.waitForTimeout(500);

        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.selectionCount).toBe(1);

        // Dragging backwards from the pressed word: the selection runs from the end of
        // the item above through to the start of "World".
        const selection = cursorData.selections[0];
        expect(selection.startItemId).toBe(aboveItemId);
        expect(selection.startOffset).toBe(ABOVE_TEXT.length);
        // Guards the raw-vs-rendered distinction: a DOM-derived offset would be the
        // shorter rendered length instead.
        expect(ABOVE_TEXT.length).toBeGreaterThan(ABOVE_RENDERED_TEXT.length);
        expect(selection.endItemId).toBe(pressedItemId);
        expect(selection.endOffset).toBe(WORD_START);
        expect(selection.isReversed).toBe(true);
        expect(cursorData.activeItemId).toBe(aboveItemId);
    });

    test("a plain pan scrolls the outline instead of selecting text", async ({ page }, testInfo) => {
        // Enough items to make the outline taller than the mobile viewport.
        const lines = Array.from({ length: 40 }, (_unused, index) => `Scrollable item ${index + 1}`);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, lines);
        await page.waitForSelector("text=Loading Page...", { state: "hidden", timeout: 10000 });

        const firstItem = page.locator(".outliner-item:not(.page-title)").first();
        await expect(firstItem).toBeVisible();

        const box = await firstItem.boundingBox();
        expect(box).not.toBeNull();

        const scrollTopBefore = await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0);

        // A quick pan never pauses, so the long-press timer must never fire.
        await TouchGestures.pan(
            page,
            { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 },
            { x: box!.x + box!.width / 2, y: box!.y - 300 },
        );
        await page.waitForTimeout(500);

        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.selectionCount).toBe(0);

        const scrollTopAfter = await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0);
        expect(scrollTopAfter).toBeGreaterThan(scrollTopBefore);
    });
});
