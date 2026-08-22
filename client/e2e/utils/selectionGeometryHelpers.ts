import { expect, type Page } from "@playwright/test";

/**
 * Helpers for selection-rendering specs that assert on real layout geometry.
 *
 * They read positions back from the rendered document (DOM ranges and the overlay's own
 * fragments) rather than assuming a character width, so the same helper works for wrapped
 * text, formatted text and multi-item selections.
 */

export interface Point {
    x: number;
    y: number;
}

export interface SelectionFragmentBox {
    itemId: string | null;
    /** "text" for a character range, "node" for a whole visual node (#5024). */
    kind: string | null;
    left: number;
    top: number;
    width: number;
    height: number;
}

/** Viewport point at the left edge of the character at `offset`, using the real rendered layout. */
export async function pointForOffset(page: Page, itemId: string, offset: number): Promise<Point> {
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

    expect(point, `no layout position for offset ${offset} of item ${itemId}`).toBeTruthy();
    return point!;
}

/** Press, move and release the mouse between two viewport points, then let the overlay settle. */
export async function dragBetween(page: Page, from: Point, to: Point): Promise<void> {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(500);
}

/** All rendered selection fragments, in a stable order and rounded to whole pixels. */
export async function selectionFragmentBoxes(page: Page): Promise<SelectionFragmentBox[]> {
    return await page.locator(".editor-overlay .selection").evaluateAll(els =>
        els
            .map(el => {
                const rect = el.getBoundingClientRect();
                return {
                    itemId: el.getAttribute("data-selection-item-id"),
                    kind: el.getAttribute("data-selection-kind"),
                    left: Math.round(rect.left),
                    top: Math.round(rect.top),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
                };
            })
            .sort((a, b) => (a.top - b.top) || (a.left - b.left))
    );
}

/**
 * Viewport box of a visual node's rendered block.
 *
 * A Grid, Calendar or Layout owns no `.item-text` (#5015), so a spec addresses it through
 * the root element the selection overlay itself measures rather than through its innards.
 */
export async function visualNodeBox(page: Page, itemId: string) {
    const root = page.locator(`[data-visual-node-root="${itemId}"]`);
    await expect(root).toBeVisible();
    const box = await root.boundingBox();
    expect(box, `no rendered block for visual node ${itemId}`).toBeTruthy();
    return box!;
}

/** Center of a visual node's rendered block: where a drag crossing it passes through. */
export async function pointInVisualNode(page: Page, itemId: string): Promise<Point> {
    const box = await visualNodeBox(page, itemId);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Logical endpoints of the local selection, plus the text length of both endpoint items. */
export async function selectionEndpoints(page: Page) {
    return await page.evaluate(() => {
        const store = (globalThis as unknown as {
            editorOverlayStore: {
                selections: Record<string, {
                    startItemId: string;
                    startOffset: number;
                    endItemId: string;
                    endOffset: number;
                    isReversed?: boolean;
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

/** Text of the current selection as the editor itself resolves it. */
export async function selectedText(page: Page): Promise<string> {
    return await page.evaluate(() =>
        (globalThis as unknown as { editorOverlayStore: { getSelectedText: () => string; }; })
            .editorOverlayStore.getSelectedText()
    );
}
