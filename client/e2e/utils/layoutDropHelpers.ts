import type { Page } from "@playwright/test";

/**
 * Dispatches a drag sequence whose target is resolved by real
 * `elementFromPoint` hit-testing at the given viewport coordinates -- the same
 * resolution a genuine pointer-driven drag relies on -- rather than a
 * hardcoded selector. This exercises the geometry (does the pixel the user
 * would release over actually belong to the intended drop surface?).
 *
 * It also models the native negotiation a real drag depends on and a
 * CDP-simulated one cannot reliably reproduce in this environment: a region
 * only becomes a valid drop target once its own `dragenter` is accepted
 * (`preventDefault()`ed). If `dragenter` is not accepted, this stops short of
 * dispatching `dragover`/`drop` -- exactly the native refusal #5087 reported
 * (the region rendered a drop indicator but the underlying gesture never
 * produced a `drop`) -- and reports `dropped: false` instead. Unconditionally
 * firing `drop` regardless of `dragenter`'s outcome would make this pass
 * whether or not the region actually wires up `dragenter`, defeating the
 * point of the regression test.
 */
export async function dispatchDragAt(
    page: Page,
    sourceSelector: string,
    point: { x: number; y: number; },
): Promise<
    { tag: string; testId: string | null; itemId: string | null | undefined; dropped: boolean; }
> {
    return page.evaluate(({ sourceSelector, point }) => {
        const source = document.querySelector<HTMLElement>(sourceSelector);
        if (!source) throw new Error(`source not found: ${sourceSelector}`);
        const dataTransfer = new DataTransfer();
        const sourceRect = source.getBoundingClientRect();

        source.dispatchEvent(
            new DragEvent("dragstart", {
                bubbles: true,
                cancelable: true,
                dataTransfer,
                clientX: sourceRect.left + sourceRect.width / 2,
                clientY: sourceRect.top + sourceRect.height / 2,
            }),
        );

        const target = document.elementFromPoint(point.x, point.y) as HTMLElement | null;
        if (!target) throw new Error(`no element at ${point.x},${point.y}`);
        const at = { bubbles: true, cancelable: true, dataTransfer, clientX: point.x, clientY: point.y };

        const enter = new DragEvent("dragenter", at);
        target.dispatchEvent(enter);

        let dropped = false;
        if (enter.defaultPrevented) {
            target.dispatchEvent(new DragEvent("dragover", at));
            target.dispatchEvent(new DragEvent("drop", at));
            dropped = true;
        }
        source.dispatchEvent(new DragEvent("dragend", at));

        return {
            tag: target.tagName,
            testId: target.getAttribute("data-testid"),
            itemId: target.closest("[data-item-id]")?.getAttribute("data-item-id"),
            dropped,
        };
    }, { sourceSelector, point });
}

/** Turns page item 0 into an empty Layout and item 1 into a standalone visual block. */
export async function seedEmptyLayoutAndBlock(
    page: Page,
    blockType: "yjstable" | "calendar",
): Promise<{ layoutId: string; blockId: string; }> {
    return page.evaluate((type) => {
        const items = (globalThis as any).generalStore.currentPage.items;
        const layout = items.at(0);
        layout.componentType = "layout";
        const block = items.at(1);
        block.componentType = type;
        return { layoutId: layout.id, blockId: block.id };
    }, blockType);
}

/** The ids of a Layout's current direct children, in tree order. */
export async function layoutChildIds(page: Page, layoutId: string): Promise<string[]> {
    return page.evaluate((id) => {
        const items = (globalThis as any).generalStore.currentPage.items;
        const layout = [...items].find((item: { id: string; }) => item.id === id);
        return [...layout.items].map((child: { id: string; }) => child.id);
    }, layoutId);
}
