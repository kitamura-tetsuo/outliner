import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Undo after moving items by dragging", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Item 1", "Item 2", "Item 3"]);
        await TestHelpers.waitForOutlinerItems(page, 4, 10000); // Title + 3 seeded items
    });

    test("Can undo moving items by dragging", async ({ page }) => {
        const firstId = await TestHelpers.getItemIdByIndex(page, 1);
        const secondId = await TestHelpers.getItemIdByIndex(page, 2);
        const thirdId = await TestHelpers.getItemIdByIndex(page, 3);

        const thirdItem = page.locator(`.outliner-item[data-item-id="${thirdId}"]`);
        await thirdItem.waitFor({ state: "visible" });

        await expect(page.locator(`.outliner-item[data-item-id="${firstId}"] .item-text`)).toHaveText("Item 1");
        await expect(page.locator(`.outliner-item[data-item-id="${secondId}"] .item-text`)).toHaveText("Item 2");
        await expect(page.locator(`.outliner-item[data-item-id="${thirdId}"] .item-text`)).toHaveText("Item 3");

        const secondText = await page.locator(`.outliner-item[data-item-id="${secondId}"] .item-text`).textContent();

        await page.evaluate(({ secondId, thirdId }) => {
            const sourceContent = document.querySelector<HTMLElement>(`[data-item-id="${secondId}"] .drag-handle`)
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

        await page.waitForFunction(
            ({ secondId, thirdId }) => {
                const items = Array.from(document.querySelectorAll(".outliner-item[data-item-id]"));
                const thirdIdx = items.findIndex(el => el.getAttribute("data-item-id") === thirdId);
                const secondIdx = items.findIndex(el => el.getAttribute("data-item-id") === secondId);
                return secondIdx > thirdIdx;
            },
            { secondId, thirdId },
            { timeout: 10000 },
        ).catch(() => {
            console.log("Drag reorder did not complete as expected, continuing anyway");
        });

        const items = await page.locator(".outliner-item .item-text").allTextContents();
        expect(items[1]).toBe("Item 1");
        expect(items[2]).toBe("Item 3");
        expect(items[3]).toBe("Item 2");

        await page.keyboard.press("Control+z");

        await page.waitForFunction(
            ({ secondId, thirdId }) => {
                const items = Array.from(document.querySelectorAll(".outliner-item[data-item-id]"));
                const thirdIdx = items.findIndex(el => el.getAttribute("data-item-id") === thirdId);
                const secondIdx = items.findIndex(el => el.getAttribute("data-item-id") === secondId);
                return secondIdx < thirdIdx;
            },
            { secondId, thirdId },
            { timeout: 5000 },
        );

        const itemsAfterUndo = await page.locator(".outliner-item .item-text").allTextContents();
        expect(itemsAfterUndo[1]).toBe("Item 1");
        expect(itemsAfterUndo[2]).toBe("Item 2");
        expect(itemsAfterUndo[3]).toBe("Item 3");
    });
});
