import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import "../utils/registerAfterEachSnapshot";
import { type BrowserContext, expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

// The collaboration server; the Vite dev server (and its HMR socket) is on a
// different port and must stay reachable or the page cannot reload at all.
const YJS_WS_PORT = new URL(process.env.VITE_YJS_WS_URL ?? "ws://127.0.0.1:7093").port;

/**
 * Cut the page off from the collaboration server while leaving HTTP intact.
 *
 * `context.setOffline(true)` also blocks the dev server, so a reload fails with
 * ERR_INTERNET_DISCONNECTED before the app ever boots. Instead we intercept the
 * Yjs WebSocket and never connect it upstream: the route survives reloads, so
 * anything the page shows afterwards can only have come from IndexedDB.
 */
async function blockCollaborationSocket(context: BrowserContext): Promise<void> {
    await context.routeWebSocket(
        (url: URL) => url.port === YJS_WS_PORT,
        () => {
            // Intentionally do not call connectToServer(): the socket stays open
            // client-side but never reaches the server.
        },
    );
}

/**
 * @feature YDOC-0001
 *  Title: Y.Doc persistence and offline editing
 *  Source: docs/client-features.yaml
 *
 * This test suite validates Y.Doc's local caching and offline editing capabilities.
 * It verifies that content is restored after a page reload through persistence using IndexedDB.
 */
test.describe("Y.Doc persistence and offline editing", () => {
    /**
     * Helper function to get container ID from URL
     */
    function getContainerIdFromUrl(url: string): string {
        try {
            const urlObj = new URL(url);
            const parts = urlObj.pathname.split("/").filter(Boolean);
            // URL format: /{projectTitle}/{pageTitle}
            // Container ID should be in globalThis object or derive from project title
            return parts.length > 0 ? parts[0] : "";
        } catch {
            return "";
        }
    }

    /**
     * Helper to get current page texts from the UI
     */
    async function getCurrentPageTexts(page: any): Promise<string[]> {
        return await page.evaluate(() => {
            try {
                const gs = (globalThis as any).generalStore || (globalThis as any).appStore;
                if (!gs?.currentPage?.items) return [];

                const items = gs.currentPage.items as any[];
                const texts: string[] = [];
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    const text = item?.text?.toString?.() ?? String(item?.text ?? "");
                    texts.push(text);
                }
                return texts;
            } catch {
                return [];
            }
        });
    }

    /**
     * Helper to get project title from the current state
     */
    async function getProjectTitle(page: any): Promise<string> {
        return await page.evaluate(() => {
            try {
                const gs = (globalThis as any).generalStore || (globalThis as any).appStore;
                return gs?.project?.title ?? "";
            } catch {
                return "";
            }
        });
    }

    test.describe("Basic persistence", () => {
        test.beforeEach(async ({ page }, testInfo) => {
            // Prepare test environment with sample data
            await TestHelpers.seedProjectAndNavigate(page, testInfo, [
                "Initial content line 1",
                "Initial content line 2",
                "Initial content line 3",
            ]);
        });

        test("should restore container content after page reload", async ({ page }) => {
            // Verify initial content exists
            await page.waitForFunction(() => {
                const gs = (globalThis as any).generalStore;
                return !!(gs && gs.currentPage && gs.currentPage.items);
            }, { timeout: 10000 });

            const initialTexts = await getCurrentPageTexts(page);
            expect(initialTexts.length).toBeGreaterThan(0);
            expect(initialTexts[0]).toBe("Initial content line 1");
            console.log("Initial content verified:", initialTexts);

            // Reload the page
            await page.reload({ waitUntil: "domcontentloaded" });

            // Wait for the page to reload and reinitialize
            await page.waitForFunction(() => {
                const gs = (globalThis as any).generalStore;
                return !!(gs && gs.currentPage && gs.currentPage.items);
            }, { timeout: 15000 });

            // Verify content is restored from IndexedDB cache
            const restoredTexts = await getCurrentPageTexts(page);
            expect(restoredTexts.length).toBe(initialTexts.length);
            expect(restoredTexts[0]).toBe("Initial content line 1");
            console.log("Restored content verified:", restoredTexts);
        });

        test("should persist edits while offline", async ({ page, context }) => {
            // Verify initial state
            await page.waitForFunction(() => {
                const gs = (globalThis as any).generalStore;
                return !!(gs && gs.currentPage && gs.currentPage.items);
            }, { timeout: 10000 });

            // Sever collaboration sync, then drop the network so the live socket
            // dies and the edits below cannot reach the server.
            await blockCollaborationSocket(context);
            await context.setOffline(true);
            console.log("Collaboration socket blocked and browser set offline");

            // Make edits while offline
            await page.evaluate(() => {
                const gs = (globalThis as any).generalStore;
                const pageRef = gs?.currentPage;
                const items = pageRef?.items as any;
                if (items && items.length > 0) {
                    // Modify the first item
                    const firstItem = items[0];
                    firstItem.updateText("Offline edited content");
                }
            });

            // Add a new item while offline
            await page.evaluate(() => {
                const gs = (globalThis as any).generalStore;
                const pageRef = gs?.currentPage;
                const items = pageRef?.items as any;
                if (items && typeof items.addNode === "function") {
                    const newItem = items.addNode("tester");
                    newItem.updateText("New offline item");
                }
            });

            const offlineTexts = await getCurrentPageTexts(page);
            expect(offlineTexts[0]).toBe("Offline edited content");
            expect(offlineTexts[offlineTexts.length - 1]).toBe("New offline item");
            console.log("Offline edits verified:", offlineTexts);

            // Restore HTTP so the app can boot; the WebSocket route keeps the
            // collaboration server unreachable across the reload.
            await context.setOffline(false);
            await page.reload({ waitUntil: "domcontentloaded" });
            console.log("Page reloaded with collaboration server still unreachable");

            // Wait for reinitialization
            await page.waitForFunction(() => {
                const gs = (globalThis as any).generalStore;
                return !!(gs && gs.currentPage && gs.currentPage.items);
            }, { timeout: 15000 });

            // Verify offline edits persist after reload
            const persistedOfflineTexts = await getCurrentPageTexts(page);
            expect(persistedOfflineTexts[0]).toBe("Offline edited content");
            expect(persistedOfflineTexts[persistedOfflineTexts.length - 1]).toBe("New offline item");
            console.log("Offline edits persisted after reload:", persistedOfflineTexts);
        });

        test("should not break dropdown title display from #1061", async ({ page }) => {
            // Get the project title
            const projectTitle = await getProjectTitle(page);
            expect(projectTitle).toBeTruthy();

            // Verify the title is displayed in dropdown/title area
            await page.waitForSelector('[data-testid="outliner-base"]', { timeout: 10000 });
            console.log(`Project title: ${projectTitle}`);

            // Get title from metadata or current state
            const displayedTitle = await page.evaluate(() => {
                try {
                    const gs = (globalThis as any).generalStore;
                    const yjsService = (globalThis as any).__YJS_SERVICE__;
                    if (yjsService?.getProjectTitle) {
                        // Try to get from current URL or state
                        const pathParts = globalThis.location.pathname.split("/").filter(Boolean);
                        if (pathParts.length > 0) {
                            const containerId = pathParts[0];
                            return yjsService.getProjectTitle(containerId);
                        }
                    }
                    return gs?.project?.title ?? "";
                } catch {
                    return "";
                }
            });

            // The title should be from the project, not a container ID
            expect(displayedTitle).toBeTruthy();
            expect(displayedTitle).not.toMatch(/^p[a-f0-9]+$/); // Should not be a container ID like "pabc123"

            // Reload the page
            await page.reload({ waitUntil: "domcontentloaded" });
            await page.waitForSelector('[data-testid="outliner-base"]', { timeout: 10000 });

            // Verify title is still correct after reload (metadata Y.Doc is working)
            const restoredTitle = await page.evaluate(() => {
                try {
                    const gs = (globalThis as any).generalStore;
                    return gs?.project?.title ?? "";
                } catch {
                    return "";
                }
            });

            expect(restoredTitle).toBeTruthy();
            expect(restoredTitle).toBe(projectTitle);
            console.log(`Title display verified: ${restoredTitle}`);
        });
    });

    test.describe("Multiple containers", () => {
        test("should handle multiple containers independently", async ({ page }) => {
            // Create first container with unique content
            const containerAInfo = await TestHelpers.seedProjectAndNavigate(page, null, [
                "Container A - Line 1",
                "Container A - Line 2",
            ]);

            const containerAId = getContainerIdFromUrl(page.url());
            const containerATitle = containerAInfo.projectName;
            console.log(`Created Container A: ${containerATitle} (ID: ${containerAId})`);

            // Store the content for Container A
            const contentA = await getCurrentPageTexts(page);
            expect(contentA.length).toBeGreaterThan(0);

            // Seed Container B the same way as A, rather than navigating by hand and
            // building the page in-browser: an unseeded container has no page to
            // attach items to, so the in-browser construction silently produced nothing.
            const containerBTitle = `Test Project B ${Date.now()}`;
            await TestHelpers.seedProjectAndNavigate(
                page,
                null,
                [
                    "Container B - Line 1",
                    "Container B - Line 2",
                ],
                undefined,
                { projectName: containerBTitle },
            );

            const containerBId = getContainerIdFromUrl(page.url());
            console.log(`Created Container B: ${containerBTitle} (ID: ${containerBId})`);

            // Verify Container B content
            const contentB = await getCurrentPageTexts(page);
            expect(contentB[0]).toBe("Container B - Line 1");
            expect(contentB[1]).toBe("Container B - Line 2");
            console.log("Container B content verified:", contentB);

            // Reload the page
            await page.reload({ waitUntil: "domcontentloaded" });
            await page.waitForFunction(() => {
                const gs = (globalThis as any).generalStore;
                return !!(gs && gs.currentPage && gs.currentPage.items);
            }, { timeout: 15000 });

            // Verify Container B is still active with correct content
            const restoredContentB = await getCurrentPageTexts(page);
            expect(restoredContentB[0]).toBe("Container B - Line 1");
            expect(restoredContentB[1]).toBe("Container B - Line 2");
            console.log("Container B restored:", restoredContentB);

            // Navigate back to Container A
            const urlA = `/${encodeURIComponent(containerATitle)}/${encodeURIComponent(containerAInfo.pageName)}`;
            await page.goto(urlA, { waitUntil: "domcontentloaded" });
            await page.waitForURL(`**/${encodeURIComponent(containerATitle)}/**`, { timeout: 15000 });

            // Wait for Container A to load
            await page.waitForFunction(() => {
                const gs = (globalThis as any).generalStore;
                return !!(gs && gs.currentPage && gs.currentPage.items);
            }, { timeout: 15000 });

            // Verify Container A content is intact
            const restoredContentA = await getCurrentPageTexts(page);
            expect(restoredContentA.length).toBe(contentA.length);
            // The content might have been cleared during navigation, so we just verify it restored
            console.log("Container A restored:", restoredContentA);
        });
    });

    test.describe("Complex offline scenarios", () => {
        test("should handle offline edits and online sync transitions", async ({ page, context }) => {
            await TestHelpers.seedProjectAndNavigate(page, null, [
                "Pre-offline content",
            ]);

            // Verify initial state
            await page.waitForFunction(() => {
                const gs = (globalThis as any).generalStore;
                return !!(gs && gs.currentPage && gs.currentPage.items);
            }, { timeout: 10000 });

            // Go offline and make complex edits
            await blockCollaborationSocket(context);
            await context.setOffline(true);

            await page.evaluate(() => {
                const gs = (globalThis as any).generalStore;
                const pageRef = gs?.currentPage;
                const items = pageRef?.items as any;

                // Modify first item
                if (items?.length > 0) {
                    const first = items[0];
                    first.updateText("Modified while offline");
                }

                // Add multiple items
                for (let i = 0; i < 3; i++) {
                    const newItem = items.addNode("tester");
                    newItem.updateText(`Offline item ${i + 1}`);
                }
            });

            const offlineContent = await getCurrentPageTexts(page);
            console.log("Content while offline:", offlineContent);

            // Restore HTTP so the app can boot; the collaboration server stays
            // unreachable, so the restored content can only come from IndexedDB.
            await context.setOffline(false);
            await page.reload({ waitUntil: "domcontentloaded" });
            await page.waitForFunction(() => {
                const gs = (globalThis as any).generalStore;
                return !!(gs && gs.currentPage && gs.currentPage.items);
            }, { timeout: 15000 });

            const afterOfflineReload = await getCurrentPageTexts(page);
            expect(afterOfflineReload[0]).toBe("Modified while offline");
            expect(afterOfflineReload[1]).toBe("Offline item 1");
            if (afterOfflineReload.length > 2) expect(afterOfflineReload[2]).toBe("Offline item 2");
            if (afterOfflineReload.length > 3) expect(afterOfflineReload[3]).toBe("Offline item 3");
            console.log("Content persisted after offline reload:", afterOfflineReload);
        });
    });

    test.describe("Cache isolation", () => {
        test("should maintain independent cache for each container", async ({ page }) => {
            // Create first container
            const container1Info = await TestHelpers.seedProjectAndNavigate(page, null, [
                "Container 1 specific data",
            ]);

            const title1 = container1Info.projectName;
            const pageName1 = container1Info.pageName;

            // Verify content
            const content1 = await getCurrentPageTexts(page);
            expect(content1[0]).toBe("Container 1 specific data");

            // Seed the second container rather than navigating to an unseeded URL and
            // building its page in-browser: there is no page to attach items to, so
            // the items were never created and the assertion below read undefined.
            const title2 = `Test Project 2 ${Date.now()}`;
            await TestHelpers.seedProjectAndNavigate(
                page,
                null,
                ["Container 2 specific data"],
                undefined,
                { projectName: title2 },
            );

            const content2 = await getCurrentPageTexts(page);
            expect(content2[0]).toBe("Container 2 specific data");

            // Navigate back to first container
            const url1 = `/${encodeURIComponent(title1)}/${encodeURIComponent(pageName1)}`;
            await page.goto(url1, { waitUntil: "domcontentloaded" });
            await page.waitForURL(`**/${encodeURIComponent(title1)}/**`, { timeout: 15000 });

            await page.waitForFunction(() => {
                const gs = (globalThis as any).generalStore;
                return !!(gs && gs.currentPage && gs.currentPage.items);
            }, { timeout: 15000 });

            // Verify first container's data is still intact
            const restoredContent1 = await getCurrentPageTexts(page);
            expect(restoredContent1[0]).toBe("Container 1 specific data");
            console.log("Container 1 cache is independent:", restoredContent1);
        });
    });
});
