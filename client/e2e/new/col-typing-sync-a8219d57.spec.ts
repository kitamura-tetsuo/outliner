/** @feature COL-a8219d57
 *  Title   : Yjs collaboration typing sync
 */
import { expect, test } from "@playwright/test";
import { ensureOutlinerItemCount } from "../helpers";
import { TestHelpers } from "../utils/testHelpers";

test("typing sync between two browsers", async ({ browser }, testInfo) => {
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    // Enable Yjs WS before any navigation initiated by TestHelpers
    await page1.addInitScript(() => localStorage.setItem("VITE_YJS_ENABLE_WS", "true"));
    const { projectName, pageName } = await TestHelpers.prepareTestEnvironment(page1, testInfo, [], undefined, {
        enableYjsWs: true,
    });
    await page1.goto(`/${projectName}/${pageName}`);
    // Force-enable WS connection in tests that require collaboration
    await page1.addInitScript(() => localStorage.setItem("VITE_YJS_ENABLE_WS", "true"));
    // Wait for Yjs connection to avoid editing a provisional project
    await page1.waitForFunction(() => (window as any).__YJS_STORE__?.getIsConnected?.() === true, null, {
        timeout: 15000,
    });
    await ensureOutlinerItemCount(page1, 2);

    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    // Enable Yjs WS before TestHelpers navigates
    await page2.addInitScript(() => localStorage.setItem("VITE_YJS_ENABLE_WS", "true"));
    await TestHelpers.prepareTestEnvironment(page2, testInfo, [], undefined, { enableYjsWs: true });
    await page2.goto(`/${projectName}/${pageName}`);
    await page2.addInitScript(() => localStorage.setItem("VITE_YJS_ENABLE_WS", "true"));
    await page2.waitForFunction(() => (window as any).__YJS_STORE__?.getIsConnected?.() === true, null, {
        timeout: 15000,
    });

    // Use editorOverlayStore cursor APIs for reliable editing targeting content row (skip title row)
    // Edit the title row (first item) to ensure consistent target across browsers
    await ensureOutlinerItemCount(page1, 2);
    const titleId = await page1.locator(".outliner-item").nth(0).getAttribute("data-item-id");
    expect(titleId).toBeTruthy();
    await TestHelpers.setCursor(page1, titleId!);
    await page1.evaluate((itemId) => {
        const editorStore = (window as any).editorOverlayStore;
        const cursor = editorStore?.getCursorInstances?.().find((c: any) => c.itemId === itemId);
        if (cursor) {
            const target = cursor.findTarget?.();
            if (target) {
                target.updateText("");
                cursor.offset = 0;
                cursor.insertText("hello");
            }
        }
    }, titleId);
    await TestHelpers.waitForCursorVisible(page1);

    // Wait until the first item on page2 reflects the change
    await ensureOutlinerItemCount(page2, 2);
    await page2.waitForFunction(() => {
        const nodes = Array.from(document.querySelectorAll(".outliner-item .item-text")) as HTMLElement[];
        return nodes.some(n => (n.textContent || "").includes("hello"));
    });
    const allTexts = await page2.locator(".outliner-item .item-text").allTextContents();
    expect(allTexts.join("\n")).toContain("hello");
});
import "../utils/registerAfterEachSnapshot";
