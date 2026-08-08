import { devices, expect, test } from "@playwright/test";
import { CursorValidator } from "../utils/cursorValidation";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
import { TouchGestures } from "../utils/touchGestures";

registerCoverageHooks();

test.use({ ...devices["Pixel 7"], hasTouch: true });

const ITEM_TEXT = "Hello World";
// Offsets of "World" inside ITEM_TEXT; findWordBoundaries snaps a long press to these.
const WORD_START = 6;
const WORD_END = 11;

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

    return { itemId: itemId!, box: box! };
}

test.describe("Mobile long-press text selection", () => {
    test("a long press selects the word under the finger", async ({ page }, testInfo) => {
        const { itemId, box } = await seedAndLocateItem(page, testInfo);

        // 80% across "Hello World" lands inside "World".
        await TouchGestures.longPress(page, TouchGestures.pointInBox(box, 0.8));
        await page.waitForTimeout(500);

        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.selectionCount).toBe(1);

        const selection = cursorData.selections[0];
        expect(selection.startItemId).toBe(itemId);
        expect(selection.endItemId).toBe(itemId);
        expect(selection.startOffset).toBe(WORD_START);
        expect(selection.endOffset).toBe(WORD_END);
    });

    test(
        "dragging after a long press extends the selection back to the start of the line",
        async ({ page }, testInfo) => {
            const { itemId, box } = await seedAndLocateItem(page, testInfo);

            await TouchGestures.longPressAndDrag(
                page,
                TouchGestures.pointInBox(box, 0.8),
                [
                    TouchGestures.pointInBox(box, 0.4),
                    { x: box.x + 1, y: box.y + box.height / 2 },
                ],
            );
            await page.waitForTimeout(500);

            // The drag anchors at the pressed word's start and extends to the finger,
            // so ending at the left edge selects everything before "World".
            const cursorData = await CursorValidator.getCursorData(page);
            expect(cursorData.selectionCount).toBe(1);

            const selection = cursorData.selections[0];
            expect(selection.startItemId).toBe(itemId);
            expect(selection.endItemId).toBe(itemId);
            expect(selection.startOffset).toBe(0);
            expect(selection.endOffset).toBe(WORD_START);
            expect(selection.isReversed).toBe(true);
        },
    );

    test("a long-press selection survives the browser's synthesized mouse events", async ({ page }, testInfo) => {
        const { box } = await seedAndLocateItem(page, testInfo);

        await TouchGestures.longPress(page, TouchGestures.pointInBox(box, 0.8));

        // The compatibility click arrives well after touchend; it must not collapse
        // the selection back down to a caret.
        await page.waitForTimeout(1000);

        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.selectionCount).toBe(1);
        expect(cursorData.selections[0].startOffset).toBe(WORD_START);
        expect(cursorData.selections[0].endOffset).toBe(WORD_END);
    });
});
