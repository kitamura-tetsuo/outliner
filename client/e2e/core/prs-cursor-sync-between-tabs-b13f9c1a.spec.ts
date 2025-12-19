import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature PRS-b13f9c1a
 * Title   : Cursor sync between tabs
 * Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Cursor sync between tabs", () => {
    test("typing in one tab shows in another", async ({ browser }, testInfo) => {
        // Create the first browser context and page
        const context1 = await browser.newContext();
        const page1 = await context1.newPage();

        // Prepare the environment with "force" WS and seeded lines
        const { projectName, pageName } = await TestHelpers.prepareTestEnvironment(
            page1,
            testInfo,
            [
                "一行目: テスト",
                "二行目: Yjs 反映",
                "三行目: 並び順チェック",
            ],
            undefined,
            { ws: "force" },
        );

        // Wait for Yjs connection to be established
        try {
            await page1.waitForFunction(() => (window as any).__YJS_STORE__?.getIsConnected?.() === true, null, {
                timeout: 10000, // Shorter timeout to avoid hanging
            });
        } catch {
            console.log("YJS connection not established on page1, continuing with test");
            // Continue even if connection fails - test might still work with local sync
        }

        // Create the second browser context and page
        const context2 = await browser.newContext();
        const page2 = await context2.newPage();

        // Initialize the second page's environment to ensure flags (like WS force) are set
        // But use ForProject version to avoid creating a new project/page
        await TestHelpers.prepareTestEnvironmentForProject(page2, testInfo, [], undefined);
        // Manually override WS mode for the second context since prepareTestEnvironmentForProject defaults to disable
        await page2.addInitScript(() => {
            localStorage.setItem("VITE_YJS_FORCE_WS", "true");
            localStorage.setItem("VITE_YJS_ENABLE_WS", "true");
            localStorage.removeItem("VITE_YJS_DISABLE_WS");
        });

        // Navigate to the same project and page in the second context
        await page2.goto(`/${encodeURIComponent(projectName)}/${encodeURIComponent(pageName)}`);

        // Wait for Yjs connection to be established on page2
        try {
            await page2.waitForFunction(() => (window as any).__YJS_STORE__?.getIsConnected?.() === true, null, {
                timeout: 10000, // Shorter timeout to avoid hanging
            });
        } catch {
            console.log("YJS connection not established on page2, continuing with test");
            // Continue even if connection fails - test might still work with local sync
        }

        // Wait for both pages to load completely and synchronize
        await expect(page1.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
        // Wait for the seeded content to specifically appear on page2 to confirm synchronization
        // Use getByText with regex to handle surrounding text/icons
        await expect(page2.getByText(/テスト/).first()).toBeVisible({ timeout: 20000 });

        // Verify both pages have the same initial content
        const page1InitialTexts = await page1.locator(".outliner-item .item-text").allTextContents();
        const page1InitialContent = page1InitialTexts.join("\n");
        const page2InitialTexts = await page2.locator(".outliner-item .item-text").allTextContents();
        const page2InitialContent = page2InitialTexts.join("\n");

        expect(page1InitialContent).toContain("テスト");
        expect(page2InitialContent).toContain("テスト");

        // Get the second item to modify (to avoid page title) using the same approach as the working test
        await expect(page1.locator(".outliner-item")).toHaveCount(4, { timeout: 10000 }); // We expect 4 items (page title + 3 from initial content)
        const itemId = await page1.locator(".outliner-item").nth(1).getAttribute("data-item-id"); // Get second item
        expect(itemId).toBeTruthy();

        // Use editorOverlayStore cursor APIs for reliable editing (similar to working test)
        await TestHelpers.setCursor(page1, itemId!);
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
        }, itemId);

        // Wait for cursor visibility
        await TestHelpers.waitForCursorVisible(page1);

        // Wait for synchronization to reflect in page2 using Playwright's built-in retry logic
        // Use regex and first() to avoid strict mode/exact match issues
        await expect(page2.getByText(/hello/).first()).toBeVisible({ timeout: 30000 });

        console.log("Yjs synchronization successful: 'hello' found in page2");

        // Since Yjs connection may not be established, we'll just verify that the operation didn't crash the app
        // and both pages are still accessible
        expect(await page1.title()).toBeDefined();
        expect(await page2.title()).toBeDefined();

        // Close contexts after successful test
        await context1.close();
        await context2.close();
    });
});
