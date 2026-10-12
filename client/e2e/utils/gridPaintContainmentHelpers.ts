import { expect, type Locator } from "@playwright/test";

export async function expectWithin(inner: Locator, outer: Locator): Promise<void> {
    const outerBox = await outer.boundingBox();
    const innerBox = await inner.boundingBox();
    expect(outerBox).not.toBeNull();
    expect(innerBox).not.toBeNull();
    expect(innerBox!.x).toBeGreaterThanOrEqual(outerBox!.x - 1);
    expect(innerBox!.x + innerBox!.width).toBeLessThanOrEqual(outerBox!.x + outerBox!.width + 1);
}

/** Measure overflowing glyph bounds and their effective browser clipping edge. */
export async function expectTextPaintClipped(text: Locator): Promise<void> {
    const geometry = await text.evaluate((element) => {
        const cell = element.closest("th, td")!;
        const cellRight = cell.getBoundingClientRect().right;
        const range = document.createRange();
        range.selectNodeContents(element);
        const glyphRight = range.getBoundingClientRect().right;
        let clipRight = Infinity;
        for (let node: Element | null = element; node; node = node.parentElement) {
            const style = getComputedStyle(node);
            if (["hidden", "clip", "auto", "scroll"].includes(style.overflowX)) {
                clipRight = Math.min(
                    clipRight,
                    node.getBoundingClientRect().right - parseFloat(style.borderRightWidth),
                );
            }
            if (node === cell) break;
        }
        return { cellRight, glyphRight, clipRight, hasClip: Number.isFinite(clipRight) };
    });
    // A real overflow condition and a clipping edge inside the fixed cell are
    // both required; outer boxes alone cannot satisfy this oracle.
    expect(geometry.glyphRight).toBeGreaterThan(geometry.cellRight + 1);
    expect(geometry.hasClip).toBe(true);
    expect(geometry.clipRight).toBeLessThanOrEqual(geometry.cellRight + 1);
}

/** Long body text wraps inside its fixed track instead of overflowing it. */
export async function expectTextWrappedWithin(text: Locator): Promise<void> {
    const geometry = await text.evaluate((element) => {
        const htmlElement = element as HTMLElement;
        const cell = element.closest("th, td")!;
        const row = element.closest("tr");
        const nextRow = row?.nextElementSibling ?? null;
        const range = document.createRange();
        range.selectNodeContents(element);
        const rects = Array.from(range.getClientRects()).map((rect) => ({
            top: rect.top,
            bottom: rect.bottom,
        }));
        const glyphRight = range.getBoundingClientRect().right;
        const displayBox = element.getBoundingClientRect();
        const cellBox = cell.getBoundingClientRect();
        const rowBox = row?.getBoundingClientRect() ?? null;
        const nextBox = nextRow?.getBoundingClientRect() ?? null;
        const last = rects[rects.length - 1];
        return {
            cellRight: cellBox.right,
            glyphRight,
            lineCount: rects.length,
            horizontalOverflow: htmlElement.scrollWidth - htmlElement.clientWidth,
            verticalOverflow: htmlElement.scrollHeight - htmlElement.clientHeight,
            rects,
            lastBottom: last?.bottom ?? displayBox.bottom,
            displayTop: displayBox.top,
            displayBottom: displayBox.bottom,
            cellTop: cellBox.top,
            cellBottom: cellBox.bottom,
            rowBottom: rowBox?.bottom ?? null,
            nextTop: nextBox?.top ?? null,
        };
    });
    // Wrapping absorbs the long value into multiple lines: the element does
    // not overflow and no glyph paints past the fixed cell (issue #5502).
    expect(geometry.lineCount).toBeGreaterThan(1);
    expect(geometry.horizontalOverflow).toBeLessThanOrEqual(1);
    expect(geometry.glyphRight).toBeLessThanOrEqual(geometry.cellRight + 1);
    // A capped display (for example max-height with hidden overflow) still
    // lays out multiple lines while hiding the lower ones: Range rectangles
    // describe laid-out text even when an ancestor clips it, so every
    // fragment must remain inside the visible display and cell, with no
    // vertical overflow on the display element itself.
    expect(geometry.verticalOverflow).toBeLessThanOrEqual(1);
    for (const rect of geometry.rects) {
        expect(rect.top).toBeGreaterThanOrEqual(geometry.displayTop - 1);
        expect(rect.bottom).toBeLessThanOrEqual(geometry.displayBottom + 1);
        expect(rect.top).toBeGreaterThanOrEqual(geometry.cellTop - 1);
        expect(rect.bottom).toBeLessThanOrEqual(geometry.cellBottom + 1);
    }
    // The row grows to contain the complete text and the following row starts
    // below it instead of overlapping the wrapped lines.
    if (geometry.rowBottom !== null) {
        expect(geometry.rowBottom).toBeGreaterThanOrEqual(geometry.lastBottom - 1);
    }
    if (geometry.nextTop !== null && geometry.rowBottom !== null) {
        expect(geometry.nextTop).toBeGreaterThanOrEqual(geometry.lastBottom - 1);
        expect(geometry.nextTop).toBeGreaterThanOrEqual(geometry.rowBottom - 1);
        expect(geometry.nextTop).toBeLessThanOrEqual(geometry.rowBottom + 1);
    }
}

export interface RowBox {
    top: number;
    bottom: number;
    height: number;
    nextTop: number | null;
}

/** Border box of the row owning a cell, plus the next row's top edge. */
export async function rowBoxOf(cell: Locator): Promise<RowBox> {
    return cell.evaluate((element) => {
        const row = element.closest("tr")!;
        const box = row.getBoundingClientRect();
        const next = row.nextElementSibling?.getBoundingClientRect() ?? null;
        return { top: box.top, bottom: box.bottom, height: box.height, nextTop: next?.top ?? null };
    });
}

/** Two cells' rows are stacked with no gap or overlap (order-independent). */
export async function rowsContiguous(a: Locator, b: Locator): Promise<boolean> {
    const [first, second] = await Promise.all([rowBoxOf(a), rowBoxOf(b)]);
    const upper = first.top <= second.top ? first : second;
    const lower = upper === first ? second : first;
    return Math.abs(lower.top - upper.bottom) <= 1.5;
}

/** Neighbor contents remain the topmost hit target before and during editing. */
export async function expectNeighborUncovered(cell: Locator): Promise<void> {
    await cell.scrollIntoViewIfNeeded();
    const exposed = await cell.evaluate((element) => {
        const content = element.querySelector("button, select, input")!;
        const box = content.getBoundingClientRect();
        return [0.1, 0.5, 0.9].map((fraction) => {
            const hit = document.elementFromPoint(box.left + box.width * fraction, box.top + box.height / 2);
            return hit !== null && element.contains(hit);
        });
    });
    expect(exposed).toEqual([true, true, true]);
}
