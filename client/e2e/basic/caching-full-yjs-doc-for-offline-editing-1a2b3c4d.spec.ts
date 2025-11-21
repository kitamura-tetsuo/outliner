import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Full Y.Doc caching for offline editing", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("persists container content to IndexedDB and restores on reload", async ({ page }) => {
        // Create a test container with some content
        await page.evaluate(() => {
            const gs = (window as any).generalStore;
            const project = gs?.project;
            if (!project) {
                console.error("No project found");
                return;
            }

            // Create or get current page
            if (!gs.currentPage) {
                const url = new URL(location.href);
                const parts = url.pathname.split("/").filter(Boolean);
                const pageName = decodeURIComponent(parts[1] || "test-page");
                gs.currentPage = project.addPage(pageName, "tester");
            }

            // Add test content
            const pageItem = gs.currentPage;
            const items = pageItem.items;
            const existingCount = items.length ?? 0;

            if (existingCount < 3) {
                items.addNode("tester").updateText("Item 1: Cache test");
                items.addNode("tester").updateText("Item 2: Offline editing");
                items.addNode("tester").updateText("Item 3: Persistence check");
            }
        });

        // Wait for changes to propagate and be written to IndexedDB
        await page.waitForTimeout(2000);

        // Get the container ID for reference
        const containerId = await page.evaluate(() => {
            const gs = (window as any).generalStore;
            return gs?.project?.ydoc?.guid ?? "unknown";
        });

        console.log(`Container ID: ${containerId}`);
        expect(containerId).toBeTruthy();

        // Verify content exists before reload
        await page.waitForFunction(() => {
            const texts = Array.from(document.querySelectorAll(".outliner-item[data-item-id] .item-text"))
                .map(el => el.textContent ?? "").filter(Boolean);
            return texts.length >= 3;
        }, { timeout: 30000 });

        const textsBeforeReload = await page.evaluate(() =>
            Array.from(document.querySelectorAll(".outliner-item[data-item-id] .item-text"))
                .map(el => (el.textContent ?? "").trim()).filter(Boolean)
        );

        console.log("Texts before reload:", textsBeforeReload);
        expect(textsBeforeReload.length).toBeGreaterThanOrEqual(3);

        // Reload the page
        await page.reload({ waitUntil: "domcontentloaded" });

        // Wait for IndexedDB restoration to complete
        await page.waitForTimeout(3000);

        // Verify content is restored from cache after reload
        await page.waitForFunction(() => {
            const texts = Array.from(document.querySelectorAll(".outliner-item[data-item-id] .item-text"))
                .map(el => el.textContent ?? "").filter(Boolean);
            return texts.length >= 3;
        }, { timeout: 30000 });

        const textsAfterReload = await page.evaluate(() =>
            Array.from(document.querySelectorAll(".outliner-item[data-item-id] .item-text"))
                .map(el => (el.textContent ?? "").trim()).filter(Boolean)
        );

        console.log("Texts after reload:", textsAfterReload);

        // Verify the same content exists after reload
        expect(textsAfterReload.length).toBeGreaterThanOrEqual(3);
        expect(textsAfterReload).toEqual(expect.arrayContaining([
            "Item 1: Cache test",
            "Item 2: Offline editing",
            "Item 3: Persistence check",
        ]));
    });

    test("edits while offline and persists across reloads", async ({ page }) => {
        // Set up test environment
        await page.evaluate(() => {
            const gs = (window as any).generalStore;
            const project = gs?.project;
            if (!project) return;

            if (!gs.currentPage) {
                const url = new URL(location.href);
                const parts = url.pathname.split("/").filter(Boolean);
                const pageName = decodeURIComponent(parts[1] || "offline-test");
                gs.currentPage = project.addPage(pageName, "tester");
            }

            // Add initial content
            const items = gs.currentPage.items;
            items.addNode("tester").updateText("Initial offline content");
        });

        // Wait for initial sync to IndexedDB
        await page.waitForTimeout(2000);

        // Simulate offline mode by disabling WebSocket connection
        await page.evaluate(() => {
            localStorage.setItem("VITE_YJS_DISABLE_WS", "true");
        });

        // Reload to apply offline mode
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(3000);

        // Edit content while in offline mode
        await page.evaluate(() => {
            const gs = (window as any).generalStore;
            const items = gs?.currentPage?.items;
            if (items && items.length > 0) {
                // Modify the first item
                items.at(0).updateText("Modified while offline");
                // Add a new item
                items.addNode("tester").updateText("Added while offline");
            }
        });

        // Wait for changes to be written to IndexedDB
        await page.waitForTimeout(2000);

        // Reload again while still offline
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(3000);

        // Verify offline edits are persisted
        await page.waitForFunction(() => {
            const texts = Array.from(document.querySelectorAll(".outliner-item[data-item-id] .item-text"))
                .map(el => el.textContent ?? "").filter(Boolean);
            return texts.some(t => t.includes("Modified while offline"));
        }, { timeout: 30000 });

        const textsAfterOffline = await page.evaluate(() =>
            Array.from(document.querySelectorAll(".outliner-item[data-item-id] .item-text"))
                .map(el => (el.textContent ?? "").trim()).filter(Boolean)
        );

        console.log("Texts after offline edits:", textsAfterOffline);

        // Verify offline modifications are present
        expect(textsAfterOffline).toEqual(expect.arrayContaining([
            expect.stringContaining("Modified while offline"),
            expect.stringContaining("Added while offline"),
        ]));
    });

    test("fast initial load from cache without backend", async ({ page }) => {
        // Start with WebSocket disabled to simulate no backend
        await page.evaluate(() => {
            localStorage.setItem("VITE_YJS_DISABLE_WS", "true");
        });

        // Prepare test environment
        await TestHelpers.prepareTestEnvironment(page, test.info(), [
            "Pre-cached content",
            "Should load instantly",
            "From IndexedDB cache",
        ]);

        // Wait for page to load
        await page.waitForTimeout(3000);

        // Verify content is immediately available from cache
        await page.waitForFunction(() => {
            const texts = Array.from(document.querySelectorAll(".outliner-item[data-item-id] .item-text"))
                .map(el => el.textContent ?? "").filter(Boolean);
            return texts.length >= 3;
        }, { timeout: 30000 });

        const textsFromCache = await page.evaluate(() =>
            Array.from(document.querySelectorAll(".outliner-item[data-item-id] .item-text"))
                .map(el => (el.textContent ?? "").trim()).filter(Boolean)
        );

        console.log("Texts loaded from cache:", textsFromCache);

        // Verify cached content is present
        expect(textsFromCache).toEqual(expect.arrayContaining([
            "Pre-cached content",
            "Should load instantly",
            "From IndexedDB cache",
        ]));
    });
});
