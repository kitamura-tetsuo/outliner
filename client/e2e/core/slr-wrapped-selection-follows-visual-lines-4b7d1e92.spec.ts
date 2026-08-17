import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SLR-4b7d1e92
 *  Title   : Wrapped selection follows visual lines
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

// Long enough to wrap over several visual lines at the default desktop viewport width
const WRAPPED_TEXT = "This item deliberately contains a very long sentence so that the rendered text has to wrap "
    + "onto several visual lines, which is exactly the situation where a selection highlight used to be drawn "
    + "as a single unwrapped rectangle running far past the right edge of the item instead of following each "
    + "rendered line of the paragraph.";

/** Viewport point at the left edge of the character at `offset`, using the real rendered layout. */
async function pointForOffset(page: import("@playwright/test").Page, itemId: string, offset: number) {
    return await page.evaluate(({ itemId, offset }) => {
        const el = document.querySelector(`[data-item-id="${itemId}"] .item-text`);
        if (!el) return undefined;

        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let consumed = 0;
        while (walker.nextNode()) {
            const node = walker.currentNode as Text;
            const length = node.textContent?.length ?? 0;
            if (offset <= consumed + length) {
                const range = document.createRange();
                range.setStart(node, offset - consumed);
                range.collapse(true);
                const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
                return { x: rect.left + 1, y: rect.top + rect.height / 2 };
            }
            consumed += length;
        }
        return undefined;
    }, { itemId, offset });
}

test.describe("SLR-4b7d1e92: Wrapped selection follows visual lines", () => {
    let itemId: string;

    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [WRAPPED_TEXT]);
        await TestHelpers.waitForOutlinerItems(page, 2, 10000);
        itemId = (await TestHelpers.getItemIdByIndex(page, 1))!;
        expect(itemId).toBeTruthy();
    });

    test("A selection spanning wrapped lines is drawn as one fragment per line inside the item", async ({ page }) => {
        const textEl = page.locator(`[data-item-id="${itemId}"] .item-text`);
        await textEl.waitFor({ state: "visible" });
        const textBox = (await textEl.boundingBox())!;

        // The seeded text must actually wrap for this regression to mean anything
        const lineHeight = await textEl.evaluate(el => parseFloat(getComputedStyle(el).lineHeight) || 20);
        expect(textBox.height).toBeGreaterThan(lineHeight * 1.5);

        // Drag from the first character to a point on the last visual line
        const start = (await pointForOffset(page, itemId, 0))!;
        expect(start).toBeTruthy();
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(textBox.x + textBox.width * 0.3, textBox.y + textBox.height - 3, { steps: 10 });
        await page.mouse.up();

        const fragments = page.locator(`.editor-overlay .selection[data-selection-item-id="${itemId}"]`);
        await expect(fragments.first()).toBeVisible();
        // One highlight per wrapped line rather than a single unwrapped rectangle
        expect(await fragments.count()).toBeGreaterThanOrEqual(2);

        const boxes = await fragments.evaluateAll(els =>
            els.map(el => el.getBoundingClientRect()).map(r => ({
                left: r.left,
                right: r.right,
                top: r.top,
                bottom: r.bottom,
            }))
        );

        for (const box of boxes) {
            // Never extends past the rendered text box, horizontally or vertically
            expect(box.left).toBeGreaterThanOrEqual(textBox.x - 1);
            expect(box.right).toBeLessThanOrEqual(textBox.x + textBox.width + 1);
            expect(box.top).toBeGreaterThanOrEqual(textBox.y - 2);
            expect(box.bottom).toBeLessThanOrEqual(textBox.y + textBox.height + 2);
        }

        // Each fragment sits on its own visual line
        const tops = boxes.map(box => Math.round(box.top)).sort((a, b) => a - b);
        expect(new Set(tops).size).toBe(tops.length);
    });

    test("A selection inside a single visual line stays a single fragment", async ({ page }) => {
        const textEl = page.locator(`[data-item-id="${itemId}"] .item-text`);
        await textEl.waitFor({ state: "visible" });
        const textBox = (await textEl.boundingBox())!;

        const start = (await pointForOffset(page, itemId, 5))!;
        const end = (await pointForOffset(page, itemId, 20))!;
        expect(start.y).toBe(end.y);

        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(end.x, end.y, { steps: 5 });
        await page.mouse.up();

        const fragments = page.locator(`.editor-overlay .selection[data-selection-item-id="${itemId}"]`);
        await expect(fragments).toHaveCount(1);

        const box = (await fragments.first().boundingBox())!;
        expect(box.width).toBeLessThan(textBox.width);
        expect(box.x + box.width).toBeLessThanOrEqual(textBox.x + textBox.width + 1);
    });
});
