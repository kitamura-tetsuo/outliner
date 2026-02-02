import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature ITM-00cbb408
 *  Title   : Move items by dragging
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("ITM-00cbb408: Move items by dragging", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, ["Item 1", "Item 2", "Item 3"]);
        await TestHelpers.waitForOutlinerItems(page, 4, 10000); // Title + 3 seeded items
    });

    test("Can move items by dragging", async ({ page }) => {
        // Items are already seeded:
        // Index 0: Title
        // Index 1: "Item 1"
        // Index 2: "Item 2"
        // Index 3: "Item 3"

        const firstId = await TestHelpers.getItemIdByIndex(page, 1);
        const secondId = await TestHelpers.getItemIdByIndex(page, 2);
        const thirdId = await TestHelpers.getItemIdByIndex(page, 3);

        const thirdItem = page.locator(`.outliner-item[data-item-id="${thirdId}"]`);
        await thirdItem.waitFor({ state: "visible" });

        // Verify that text is set correctly
        await expect(page.locator(`.outliner-item[data-item-id="${firstId}"] .item-text`)).toHaveText("Item 1");
        await expect(page.locator(`.outliner-item[data-item-id="${secondId}"] .item-text`)).toHaveText("Item 2");
        await expect(page.locator(`.outliner-item[data-item-id="${thirdId}"] .item-text`)).toHaveText("Item 3");

        const secondText = await page.locator(`.outliner-item[data-item-id="${secondId}"] .item-text`).textContent();

        // Execute drag operation using actual DragEvent/DataTransfer flow
        await page.evaluate(({ secondId, thirdId }) => {
            const sourceContent = document.querySelector<HTMLElement>(`[data-item-id="${secondId}"] .item-content`)
                ?? document.querySelector<HTMLElement>(`[data-item-id="${secondId}"]`);
            const targetContent = document.querySelector<HTMLElement>(`[data-item-id="${thirdId}"] .item-content`)
                ?? document.querySelector<HTMLElement>(`[data-item-id="${thirdId}"]`);

            if (!sourceContent || !targetContent) {
                throw new Error(`Source or target content element not found`);
            }

            const dataTransfer = new DataTransfer();
            dataTransfer.setData("text/plain", sourceContent.textContent ?? "");
            dataTransfer.setData("application/x-outliner-item", secondId);

            const sourceRect = sourceContent.getBoundingClientRect();
            const targetRect = targetContent.getBoundingClientRect();
            const centerX = Math.floor(targetRect.left + targetRect.width / 2);
            const bottomY = Math.floor(targetRect.bottom - 1);
            const sourceX = Math.floor(sourceRect.left + sourceRect.width / 2);
            const sourceY = Math.floor(sourceRect.top + sourceRect.height / 2);

            const dragStartEvent = new DragEvent("dragstart", {
                bubbles: true,
                cancelable: true,
                dataTransfer,
                clientX: sourceX,
                clientY: sourceY,
            });

            const dragOverEvent = new DragEvent("dragover", {
                bubbles: true,
                cancelable: true,
                dataTransfer,
                clientX: centerX,
                clientY: bottomY,
            });

            const dropEvent = new DragEvent("drop", {
                bubbles: true,
                cancelable: true,
                dataTransfer,
                clientX: centerX,
                clientY: bottomY,
            });

            const dragEndEvent = new DragEvent("dragend", {
                bubbles: true,
                cancelable: true,
                dataTransfer,
                clientX: centerX,
                clientY: bottomY,
            });

            sourceContent.dispatchEvent(dragStartEvent);
            targetContent.dispatchEvent(dragOverEvent);
            targetContent.dispatchEvent(dropEvent);
            sourceContent.dispatchEvent(dragEndEvent);
        }, { secondId, thirdId });

        // Wait for reordering by drag to complete (state-based wait)
        await page.waitForFunction(
            ({ secondId, thirdId }) => {
                const items = Array.from(document.querySelectorAll(".outliner-item[data-item-id]"));
                const thirdIdx = items.findIndex(el => el.getAttribute("data-item-id") === thirdId);
                const secondIdx = items.findIndex(el => el.getAttribute("data-item-id") === secondId);
                // Item 2 should now be after Item 3
                return secondIdx > thirdIdx;
            },
            { secondId, thirdId },
            { timeout: 10000 },
        ).catch(() => {
            console.log("Drag reorder did not complete as expected, continuing anyway");
        });

        // Verify order after move - Item 2 should be after Item 3 (index 2)
        await expect(page.locator(`.outliner-item[data-item-id="${secondId}"]`)).toBeVisible();

        // Verify that Item 2's text is correct
        const movedText = await page.locator(`.outliner-item[data-item-id="${secondId}"] .item-text`).textContent();
        expect(movedText).toBe(secondText);

        // Verify order: should be Item 1, Item 3, Item 2
        const items = await page.locator(".outliner-item .item-text").allTextContents();
        expect(items[1]).toBe("Item 1");
        expect(items[2]).toBe("Item 3");
        expect(items[3]).toBe("Item 2");
    });
});
