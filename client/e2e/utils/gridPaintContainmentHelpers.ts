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
