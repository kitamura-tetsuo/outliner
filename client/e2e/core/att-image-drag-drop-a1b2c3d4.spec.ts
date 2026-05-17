import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Image Drag and Drop (att-image-drag-drop-a1b2c3d4)", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "ITEM 1",
            "ITEM 2",
        ]);
        await TestHelpers.waitForOutlinerItems(page, 3);
    });

    async function simulateFileDrop(
        page: any,
        selector: string,
        fileName: string,
        position: "top" | "middle" | "bottom" | null = null,
    ) {
        await page.evaluate(({ sel, name, pos }) => {
            const dt = new DataTransfer();
            const pngHeader = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0]);
            const file = new File([pngHeader], name, { type: "image/png" });

            // Set fallback for E2E
            (window as any).__E2E_LAST_FILES__ = [file];

            const target = document.querySelector(sel);
            if (!target) throw new Error(`Target ${sel} not found`);

            const clientX = target.getBoundingClientRect().left + 10;
            const clientY = target.getBoundingClientRect().top
                + (pos === "top"
                    ? 2
                    : pos === "bottom"
                    ? target.getBoundingClientRect().height - 2
                    : target.getBoundingClientRect().height / 2);

            // Simulate dragover to let Svelte component calculate dropTargetPosition
            const dragOverEvent = new MouseEvent("dragover", {
                bubbles: true,
                cancelable: true,
                clientX,
                clientY,
            });
            (dragOverEvent as any).dataTransfer = dt;
            target.dispatchEvent(dragOverEvent);

            // Dispatch drop event
            const event = new MouseEvent("drop", {
                bubbles: true,
                cancelable: true,
                clientX,
                clientY,
            });
            (event as any).dataTransfer = dt;
            target.dispatchEvent(event);
        }, { sel: selector, name: fileName, pos: position });
    }

    test("drop image on item middle adds attachment to that item", async ({ page }) => {
        const itemId = await TestHelpers.getItemIdByIndex(page, 1);
        const selector = `[data-item-id="${itemId}"] .item-content`;

        await simulateFileDrop(page, selector, "test.png", "middle");

        // Check for attachment preview
        const attachments = page.locator(`[data-item-id="${itemId}"] .attachment-preview`);
        await expect(attachments).toHaveCount(1, { timeout: 15000 });
    });

    test("drop image on item top creates new item above", async ({ page }) => {
        const itemId2 = await TestHelpers.getItemIdByIndex(page, 2);
        const selector = `[data-item-id="${itemId2}"] .item-content`;

        // Initial count is 3
        await expect(page.locator(".outliner-item")).toHaveCount(3);

        await simulateFileDrop(page, selector, "top-drop.png", "top");

        // Should have 4 items now
        await expect(page.locator(".outliner-item")).toHaveCount(4, { timeout: 15000 });

        // The new item should be at index 2 (between ITEM 1 and ITEM 2)
        const newItemId = await TestHelpers.getItemIdByIndex(page, 2);
        expect(newItemId).not.toBe(itemId2);

        // The new item should have the attachment
        const attachments = page.locator(`[data-item-id="${newItemId}"] .attachment-preview`);
        await expect(attachments).toHaveCount(1, { timeout: 15000 });
    });

    test("drop image on tree container empty area creates new item at end", async ({ page }) => {
        // Initial count is 3
        await expect(page.locator(".outliner-item")).toHaveCount(3);

        await page.evaluate(() => {
            const dt = new DataTransfer();
            const pngHeader = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0]);
            const file = new File([pngHeader], "end-drop.png", { type: "image/png" });
            (window as any).__E2E_LAST_FILES__ = [file];

            const target = document.querySelector(".tree-container");
            if (!target) throw new Error("tree-container not found");

            const event = new MouseEvent("drop", {
                bubbles: true,
                cancelable: true,
                clientX: target.getBoundingClientRect().left + 10,
                clientY: target.getBoundingClientRect().bottom - 10,
            });
            (event as any).dataTransfer = dt;
            target.dispatchEvent(event);
        });

        // Should have 4 items now
        await expect(page.locator(".outliner-item")).toHaveCount(4, { timeout: 15000 });

        // The new item should be at the end
        const newItemId = await TestHelpers.getItemIdByIndex(page, 3);
        const attachments = page.locator(`[data-item-id="${newItemId}"] .attachment-preview`);
        await expect(attachments).toHaveCount(1, { timeout: 15000 });
    });
});
