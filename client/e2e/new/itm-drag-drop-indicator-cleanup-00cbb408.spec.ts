import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature ITM-00cbb408
 *  Title   : Drag items to reorder
 *  Source  : docs/client-features/itm-drag-items-to-reorder-00cbb408.yaml
 *
 *  Regression coverage for #5123: a drag gesture's blue insertion indicator
 *  must never outlive the gesture, even when the move itself reparents DOM
 *  before a later `dragend` would otherwise have delivered the cleanup.
 */
import { expect, type Page, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/** Drags `sourceId`'s handle onto `targetId`'s content, optionally skipping `drop`/`dragend`. */
async function drag(
    page: Page,
    sourceId: string,
    targetId: string,
    options: { drop: boolean; dragend: boolean; },
): Promise<void> {
    await page.evaluate(({ sourceId, targetId, options }) => {
        const source = document.querySelector<HTMLElement>(`[data-item-id="${sourceId}"] .drag-handle`);
        const target = document.querySelector<HTMLElement>(`[data-item-id="${targetId}"] .item-content`);
        if (!source || !target) throw new Error("source or target not found");

        const dataTransfer = new DataTransfer();
        dataTransfer.setData("text/plain", source.textContent ?? "");
        dataTransfer.setData("application/x-outliner-item", sourceId);

        const targetRect = target.getBoundingClientRect();
        const point = { clientX: targetRect.left + targetRect.width / 2, clientY: targetRect.bottom - 1 };

        source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer, ...point }));
        target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer, ...point }));
        if (options.drop) {
            target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer, ...point }));
        }
        if (options.dragend) {
            source.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer, ...point }));
        }
    }, { sourceId, targetId, options });
}

test.describe("ITM-00cbb408: drop is a definitive drag-indicator cleanup point", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Item 1", "Item 2", "Item 3"]);
        await TestHelpers.waitForOutlinerItems(page, 4, 10000);
    });

    test("a successful drop clears the indicator on its own, without a following dragend", async ({ page }) => {
        const secondId = await TestHelpers.getItemIdByIndex(page, 2);
        const thirdId = await TestHelpers.getItemIdByIndex(page, 3);

        // Sanity: the indicator does appear while the gesture is active.
        await drag(page, secondId, thirdId, { drop: false, dragend: false });
        await expect(page.locator(`.outliner-item[data-item-id="${thirdId}"] .item-content.drop-target`)).toBeVisible();

        // Drop only — no dragend. A completed move can detach the source node
        // before the browser ever gets to dispatch `dragend` on it, so cleanup
        // must not depend on that event.
        await drag(page, secondId, thirdId, { drop: true, dragend: false });

        await expect(page.locator(".item-content.dragging")).toHaveCount(0);
        await expect(page.locator(".item-content.drop-target")).toHaveCount(0);

        // The move itself still happened: Item 2 is now after Item 3.
        const items = await page.locator(".outliner-item .item-text").allTextContents();
        expect(items[1]).toBe("Item 1");
        expect(items[2]).toBe("Item 3");
        expect(items[3]).toBe("Item 2");
    });

    test("a cancelled drag (dragend without drop) leaves no stale indicator", async ({ page }) => {
        const secondId = await TestHelpers.getItemIdByIndex(page, 2);
        const thirdId = await TestHelpers.getItemIdByIndex(page, 3);

        await drag(page, secondId, thirdId, { drop: false, dragend: true });

        await expect(page.locator(".item-content.dragging")).toHaveCount(0);
        await expect(page.locator(".item-content.drop-target")).toHaveCount(0);

        // Nothing moved.
        const items = await page.locator(".outliner-item .item-text").allTextContents();
        expect(items[1]).toBe("Item 1");
        expect(items[2]).toBe("Item 2");
        expect(items[3]).toBe("Item 3");
    });
});
