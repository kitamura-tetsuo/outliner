import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SLR-9c3f5ad1
 *  Title   : Reverse drag selection matches forward drag
 *  Source  : docs/client-features.yaml
 */
import { expect, type Page, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

interface Point {
    x: number;
    y: number;
}

/** Viewport point at the left edge of the character at `offset`, using the real rendered layout. */
async function pointForOffset(page: Page, itemId: string, offset: number): Promise<Point> {
    const point = await page.evaluate(({ itemId, offset }) => {
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

    expect(point).toBeTruthy();
    return point!;
}

async function dragBetween(page: Page, from: Point, to: Point): Promise<void> {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(500);
}

/** All rendered selection fragments, in a stable order and rounded to whole pixels. */
async function selectionGeometry(page: Page) {
    return await page.locator(".editor-overlay .selection").evaluateAll(els =>
        els
            .map(el => {
                const rect = el.getBoundingClientRect();
                return {
                    itemId: el.getAttribute("data-selection-item-id"),
                    left: Math.round(rect.left),
                    top: Math.round(rect.top),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
                };
            })
            .sort((a, b) => (a.top - b.top) || (a.left - b.left))
    );
}

/** Logical endpoints of the local selection, plus the text length of both endpoint items. */
async function selectionOffsets(page: Page) {
    return await page.evaluate(() => {
        const store = (globalThis as unknown as {
            editorOverlayStore: {
                selections: Record<string, {
                    startItemId: string;
                    startOffset: number;
                    endItemId: string;
                    endOffset: number;
                }>;
            };
        }).editorOverlayStore;
        const sel = Object.values(store.selections)[0];
        const textLength = (itemId: string) =>
            document.querySelector(`[data-item-id="${itemId}"] .item-text`)?.textContent?.length ?? 0;
        return {
            ...sel,
            startTextLength: textLength(sel.startItemId),
            endTextLength: textLength(sel.endItemId),
        };
    });
}

test.describe("SLR-9c3f5ad1: Reverse drag selection matches forward drag", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [
            "First item of the reverse drag scenario",
            "Second item stays fully selected",
            "Third item of the reverse drag scenario",
        ]);
        await TestHelpers.waitForOutlinerItems(page, 4, 10000);
    });

    test("Bottom-to-top drag highlights the same area and copies the same text", async ({ page }) => {
        const firstId = (await TestHelpers.getItemIdByIndex(page, 1))!;
        const lastId = (await TestHelpers.getItemIdByIndex(page, 3))!;

        // Both endpoints sit mid-text, so the first and last items are only partially selected
        const upper = await pointForOffset(page, firstId, 6);
        const lower = await pointForOffset(page, lastId, 10);

        await dragBetween(page, upper, lower);
        await expect(page.locator(".editor-overlay .selection").first()).toBeVisible();
        const forwardGeometry = await selectionGeometry(page);
        const forwardText = await page.evaluate(() =>
            (globalThis as unknown as { editorOverlayStore: { getSelectedText: () => string; }; })
                .editorOverlayStore.getSelectedText()
        );
        await page.keyboard.press("Control+c");
        const forwardClipboard = await page.evaluate(() => navigator.clipboard.readText());

        // The first and last item must really be partially covered: that is where the
        // direction-dependent offset branching used to invert the highlighted interval.
        const forwardOffsets = await selectionOffsets(page);
        expect(forwardOffsets.startItemId).toBe(firstId);
        expect(forwardOffsets.endItemId).toBe(lastId);
        expect(forwardOffsets.startOffset).toBeGreaterThan(0);
        expect(forwardOffsets.startOffset).toBeLessThan(forwardOffsets.startTextLength);
        expect(forwardOffsets.endOffset).toBeGreaterThan(0);
        expect(forwardOffsets.endOffset).toBeLessThan(forwardOffsets.endTextLength);
        expect(forwardText).toContain("Second item stays fully selected");

        // Same logical range, dragged bottom-to-top
        await dragBetween(page, lower, upper);
        await expect(page.locator(".editor-overlay .selection").first()).toBeVisible();
        const reverseGeometry = await selectionGeometry(page);
        const reverseText = await page.evaluate(() =>
            (globalThis as unknown as { editorOverlayStore: { getSelectedText: () => string; }; })
                .editorOverlayStore.getSelectedText()
        );
        await page.keyboard.press("Control+c");
        const reverseClipboard = await page.evaluate(() => navigator.clipboard.readText());

        expect(reverseText).toBe(forwardText);
        expect(reverseClipboard).toBe(forwardClipboard);
        expect(reverseGeometry).toEqual(forwardGeometry);

        // The direction itself is still recorded, it just does not move the highlight
        const isReversed = await page.evaluate(() => {
            const store = (globalThis as unknown as {
                editorOverlayStore: { selections: Record<string, { isReversed?: boolean; }>; };
            }).editorOverlayStore;
            return Object.values(store.selections)[0]?.isReversed ?? false;
        });
        expect(isReversed).toBe(true);
    });

    test("Bottom-to-top drag inside one item highlights the dragged characters", async ({ page }) => {
        const firstId = (await TestHelpers.getItemIdByIndex(page, 1))!;
        const left = await pointForOffset(page, firstId, 6);
        const right = await pointForOffset(page, firstId, 16);

        await dragBetween(page, right, left);

        const fragments = page.locator(`.editor-overlay .selection[data-selection-item-id="${firstId}"]`);
        await expect(fragments).toHaveCount(1);

        // The highlight covers the dragged characters, not the complement of them
        const box = (await fragments.first().boundingBox())!;
        expect(Math.abs(box.x - (left.x - 1))).toBeLessThanOrEqual(2);
        expect(Math.abs((box.x + box.width) - (right.x - 1))).toBeLessThanOrEqual(2);
    });
});
