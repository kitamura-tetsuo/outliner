import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature ITM-00cbb408
 *  Title   : Drag items to reorder
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("ITM-00cbb408: Dragging over text selects text instead of moving the item", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [
            "First item text",
            "Second item text",
        ]);
        await TestHelpers.waitForOutlinerItems(page, 3, 10000); // Title + 2 seeded items
    });

    test("Mouse drag over item text creates a selection and keeps item order", async ({ page }) => {
        const firstId = await TestHelpers.getItemIdByIndex(page, 1);
        const secondId = await TestHelpers.getItemIdByIndex(page, 2);

        const orderBefore = await page.locator(".outliner-item").evaluateAll(
            els => els.map(el => el.getAttribute("data-item-id")),
        );

        const textEl = page.locator(`[data-item-id="${firstId}"] .item-text`);
        await textEl.waitFor({ state: "visible" });
        const box = await textEl.boundingBox();
        expect(box).not.toBeNull();

        // Drag with the mouse across the text (text-editor-like selection)
        const y = box!.y + box!.height / 2;
        await page.mouse.move(box!.x + 2, y);
        await page.mouse.down();
        await page.mouse.move(box!.x + box!.width - 2, y, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(500);

        // A selection is created
        await expect(page.locator(".editor-overlay .selection").first()).toBeVisible();
        const selectedText = await page.evaluate(() => {
            const store = (globalThis as unknown as { editorOverlayStore?: { getSelectedText: () => string; }; })
                .editorOverlayStore;
            return store ? store.getSelectedText() : "";
        });
        expect(selectedText.length).toBeGreaterThan(0);
        expect("First item text").toContain(selectedText.trim());

        // Item order is unchanged (the drag did not move the item)
        const orderAfter = await page.locator(".outliner-item").evaluateAll(
            els => els.map(el => el.getAttribute("data-item-id")),
        );
        expect(orderAfter).toEqual(orderBefore);
        expect(orderAfter).toContain(secondId);

        // No drag visual effects remain after the mouse is released
        await expect(page.locator(".item-content.dragging")).toHaveCount(0);
        await expect(page.locator(".item-content.drop-target")).toHaveCount(0);
    });

    test("Item text is not a native drag source; the drag handle is", async ({ page }) => {
        const firstId = await TestHelpers.getItemIdByIndex(page, 1);

        const draggableStates = await page.evaluate((id) => {
            const content = document.querySelector<HTMLElement>(`[data-item-id="${id}"] .item-content`);
            const handle = document.querySelector<HTMLElement>(`[data-item-id="${id}"] .drag-handle`);
            return {
                contentDraggable: content?.draggable ?? null,
                handleDraggable: handle?.draggable ?? null,
            };
        }, firstId);

        expect(draggableStates.contentDraggable).toBe(false);
        expect(draggableStates.handleDraggable).toBe(true);
    });
});
