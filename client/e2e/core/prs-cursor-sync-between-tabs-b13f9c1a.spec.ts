/** @feature PRS-b13f9c1a
 * Title   : Cursor sync between tabs
 * Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import "../utils/registerAfterEachSnapshot";

test.describe("Cursor sync between tabs", () => {
    test("typing in one tab shows in another", async ({ browser }, testInfo) => {
        // Use a fixed project name to ensure both contexts connect to the same Yjs document
        const projectName = `Test Project Sync ${Date.now()}`;
        const pageName = `sync-test-page-${Date.now()}`;

        // Create the first browser context and page
        const context1 = await browser.newContext();
        const page1 = await context1.newPage();

        // Enable Yjs WebSocket before page initialization using addInitScript
        await page1.addInitScript(() => {
            localStorage.removeItem("VITE_YJS_DISABLE_WS"); // Remove disable flag
            localStorage.setItem("VITE_YJS_ENABLE_WS", "true"); // Set enable flag
        });

        // Prepare the environment after enabling WS
        await TestHelpers.prepareTestEnvironment(page1, testInfo, [], undefined);
        await page1.goto(`/${encodeURIComponent(projectName)}/${encodeURIComponent(pageName)}`);

        // Create the second browser context and page
        const context2 = await browser.newContext();
        const page2 = await context2.newPage();

        // Also enable Yjs WebSocket for the second page
        await page2.addInitScript(() => {
            localStorage.removeItem("VITE_YJS_DISABLE_WS"); // Remove disable flag
            localStorage.setItem("VITE_YJS_ENABLE_WS", "true"); // Set enable flag
        });

        // Prepare the environment for the second page using the same project
        await TestHelpers.prepareTestEnvironment(page2, testInfo, [], undefined);
        await page2.goto(`/${encodeURIComponent(projectName)}/${encodeURIComponent(pageName)}`);

        // Wait for both pages to load completely
        await expect(page1.locator(".outliner-item").first()).toBeVisible({ timeout: 20000 });
        await expect(page2.locator(".outliner-item").first()).toBeVisible({ timeout: 20000 });

        // Use the cursor-based approach to make changes in page1
        const itemId = await page1.locator(".outliner-item").first().getAttribute("data-item-id");
        expect(itemId).toBeTruthy();

        // Set cursor in page1 and type text
        await TestHelpers.setCursor(page1, itemId!);

        // Insert text using the editor overlay store
        await page1.evaluate(async (itemId) => {
            const editorStore = (window as any).editorOverlayStore;
            if (editorStore && typeof editorStore.insertText === "function") {
                await editorStore.insertText(itemId, "hello");
            } else {
                // Fallback: try to use the cursor instance directly
                const cursor = editorStore?.getCursorInstances?.().find((c: any) => c.itemId === itemId);
                if (cursor && cursor.insertText) {
                    cursor.insertText("hello");
                } else {
                    // Last resort: try to update via general store
                    const gs = (window as any).generalStore;
                    if (gs?.currentPage?.items) {
                        const items = gs.currentPage.items;
                        if (items.length > 0) {
                            for (let i = 0; i < items.length; i++) {
                                const item = items.at ? items.at(i) : items[i];
                                if (item && item.id === itemId) {
                                    item.updateText("hello");
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }, itemId);

        // Wait for potential synchronization
        await page1.waitForTimeout(10000);

        // Verify the change appears in page2
        const allTexts = await page2.locator(".outliner-item .item-text").allTextContents();
        const page2Content = allTexts.join("\n");
        expect(page2Content).toContain("hello");

        // Close contexts after successful test
        await context1.close();
        await context2.close();
    });
});
