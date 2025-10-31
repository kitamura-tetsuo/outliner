/** @feature YJS-g3h4i5j6
 * Title   : Yjs page data sync
 * Source  : docs/client-features/yjs-page-sync-g3h4i5j6.yaml
 */
import { expect, test } from "@playwright/test";
import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

// Shorten per-spec timeout (default 240s is too long for this scenario)
test.setTimeout(120_000);

test.describe("YJS-g3h4i5j6: Yjs page data sync", () => {
    test("two browser contexts connect to same page and see same page data", async ({ browser }) => {
        // Create first browser context
        const context1 = await browser.newContext();
        const page1 = await context1.newPage();

        // Listen to console messages from page1
        page1.on("console", msg => {
            if (msg.text().includes("sync trigger") || msg.text().includes("Added")) {
                console.log(`[page1 console.${msg.type()}]`, msg.text());
            }
        });

        // Enable WebSocket and test flags for page1
        await page1.addInitScript(() => {
            localStorage.setItem("VITE_IS_TEST", "true");
            localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
            localStorage.setItem("SKIP_TEST_CONTAINER_SEED", "true");
            localStorage.setItem("VITE_YJS_ENABLE_WS", "true");
            localStorage.setItem("VITE_YJS_FORCE_WS", "true");
            (window as any).__E2E__ = true;
        });

        // Navigate to home and authenticate
        await page1.goto("http://localhost:7090/", { waitUntil: "domcontentloaded" });

        await page1.waitForFunction(() => {
            return !!(window as any).__USER_MANAGER__;
        }, { timeout: 10000 });

        await page1.evaluate(async () => {
            const mgr = (window as any).__USER_MANAGER__;
            if (mgr?.loginWithEmailPassword) {
                await mgr.loginWithEmailPassword("test@example.com", "password");
            }
        });

        await page1.waitForFunction(() => {
            const mgr = (window as any).__USER_MANAGER__;
            return !!(mgr && mgr.getCurrentUser && mgr.getCurrentUser());
        }, { timeout: 10000 });

        // Create project and page programmatically
        const projectId = `p${Date.now().toString(16)}`;
        const pageInfo = await page1.evaluate(async (pid) => {
            // @ts-expect-error - Dynamic imports in browser context require ts-expect-error
            const { createProjectConnection } = await import("/src/lib/yjs/connection.ts");
            // @ts-expect-error - Dynamic imports in browser context require ts-expect-error
            const { Project } = await import("/src/schema/app-schema.ts");

            const conn = await createProjectConnection(pid);
            (window as any).__TEST_CONN__ = conn;

            const project = Project.fromDoc(conn.doc);
            const page = project.addPage("Test Page", "tester");

            // Add test items to the page
            const pageItems = page.items as any;
            const item1 = pageItems.addNode("tester");
            item1.updateText("Test Item 1");
            const item2 = pageItems.addNode("tester");
            item2.updateText("Test Item 2");

            return {
                projectId: pid,
                pageId: page.id,
                pageTitle: page.text?.toString?.() ?? "",
            };
        }, projectId);

        console.log("Page1 created project and page:", pageInfo);
        expect(pageInfo.projectId).toBeTruthy();
        expect(pageInfo.pageId).toBeTruthy();

        // Wait for WebSocket to connect
        await page1.waitForFunction(() => {
            const conn = (window as any).__TEST_CONN__;
            return conn?.provider?.wsconnected === true;
        }, { timeout: 15000 });

        const page1WsInfo = await page1.evaluate(() => {
            const conn = (window as any).__TEST_CONN__;
            return {
                roomname: conn?.provider?.roomname,
                wsconnected: conn?.provider?.wsconnected,
                url: conn?.provider?.url,
            };
        });

        console.log("Page1 WebSocket connected:", page1WsInfo);

        // Proceed after WS connection; rely on subsequent polling on page2 for eventual consistency
        // (provider.synced may remain false if no remote updates are pending)

        // Verify page1 still has the page after WebSocket connection
        const page1VerifyInfo = await page1.evaluate(async ({ pageId }) => {
            const conn = (window as any).__TEST_CONN__;
            // @ts-expect-error - Dynamic imports in browser context require ts-expect-error
            const { Project } = await import("/src/schema/app-schema.ts");
            const project = Project.fromDoc(conn.doc);
            const items = project.items as any;
            const len = items?.length ?? 0;
            const pageIds: string[] = [];
            for (let i = 0; i < len; i++) {
                const page = items.at ? items.at(i) : items[i];
                if (page && page.id) {
                    pageIds.push(page.id);
                }
            }
            return {
                pageCount: len,
                pageIds,
                hasTargetPage: pageIds.includes(pageId),
            };
        }, { pageId: pageInfo.pageId });

        console.log("Page1 verify info:", page1VerifyInfo);

        // Wait a bit to ensure the page is synced to the server
        await page1.waitForTimeout(2000);

        // Create second browser context
        const context2 = await browser.newContext();
        const page2 = await context2.newPage();

        // Listen to console messages from page2
        page2.on("console", msg => {
            console.log(`[page2 console.${msg.type()}]`, msg.text());
        });

        // Enable WebSocket and test flags for page2
        await page2.addInitScript(() => {
            localStorage.setItem("VITE_IS_TEST", "true");
            localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
            localStorage.setItem("SKIP_TEST_CONTAINER_SEED", "true");
            localStorage.setItem("VITE_YJS_ENABLE_WS", "true");
            localStorage.setItem("VITE_YJS_FORCE_WS", "true");
            (window as any).__E2E__ = true;
        });

        // Navigate to home and authenticate
        await page2.goto("http://localhost:7090/", { waitUntil: "domcontentloaded" });

        await page2.waitForFunction(() => {
            return !!(window as any).__USER_MANAGER__;
        }, { timeout: 10000 });

        await page2.evaluate(async () => {
            const mgr = (window as any).__USER_MANAGER__;
            if (mgr?.loginWithEmailPassword) {
                await mgr.loginWithEmailPassword("test@example.com", "password");
            }
        });

        await page2.waitForFunction(() => {
            const mgr = (window as any).__USER_MANAGER__;
            return !!(mgr && mgr.getCurrentUser && mgr.getCurrentUser());
        }, { timeout: 10000 });

        // Connect to the same project programmatically
        console.log(`page2: Connecting to project ${pageInfo.projectId}`);
        await page2.evaluate(async (pid) => {
            // @ts-expect-error - Dynamic imports in browser context require ts-expect-error
            const { createProjectConnection } = await import("/src/lib/yjs/connection.ts");
            // @ts-expect-error - Dynamic imports in browser context require ts-expect-error
            const { Project } = await import("/src/schema/app-schema.ts");

            const conn = await createProjectConnection(pid);
            (window as any).__TEST_CONN__ = conn;

            // Instrument provider events for debugging
            try {
                conn.provider.on("status", (ev: any) => console.log("[yws status]", JSON.stringify(ev)));
                conn.provider.on("synced", (s: boolean) => console.log("[yws synced]", s));
            } catch {}

            const project = Project.fromDoc(conn.doc);
            console.log(`page2: Connected to project, pages count: ${project.items?.length ?? 0}`);
        }, pageInfo.projectId);

        // Wait for WebSocket to connect
        await page2.waitForFunction(() => {
            const conn = (window as any).__TEST_CONN__;
            return conn?.provider?.wsconnected === true;
        }, { timeout: 15000 });

        const page2WsInfo = await page2.evaluate(() => {
            const conn = (window as any).__TEST_CONN__;
            return {
                roomname: conn?.provider?.roomname,
                wsconnected: conn?.provider?.wsconnected,
                url: conn?.provider?.url,
            };
        });

        console.log("Page2 WebSocket connected:", page2WsInfo);

        // Trigger a change in page1 to force sync
        console.log("Triggering a change in page1 to force sync...");
        await page1.evaluate(async ({ pageId }) => {
            const conn = (window as any).__TEST_CONN__;
            // @ts-expect-error - Dynamic imports in browser context require ts-expect-error
            const { Project } = await import("/src/schema/app-schema.ts");
            const project = Project.fromDoc(conn.doc);
            const items = project.items as any;
            for (let i = 0; i < items.length; i++) {
                const page = items.at ? items.at(i) : items[i];
                if (page && page.id === pageId) {
                    // Add then immediately delete an item to trigger sync without changing final count
                    const pageItems = page.items as any;
                    const item = pageItems.addNode("tester");
                    item.updateText("Sync trigger item");
                    // Remove to keep itemCount stable (2)
                    if (typeof item.delete === "function") item.delete();
                    console.log("Added+deleted sync trigger item on page1");
                    break;
                }
            }
        }, { pageId: pageInfo.pageId });

        // Wait a bit for the change to sync
        await page1.waitForTimeout(3000);

        // Wait for page1's page to appear in page2's project
        console.log(`page2: Waiting for page1's page (ID: ${pageInfo.pageId}) to appear...`);

        // Wait for page to appear and get its data in one go
        const page2Data = await page2.waitForFunction(
            async ({ pageId }) => {
                const conn = (window as any).__TEST_CONN__;
                if (!conn || !conn.doc) {
                    console.log("page2: Connection not ready");
                    return null;
                }

                try {
                    // @ts-expect-error - Dynamic imports in browser context require ts-expect-error
                    const { Project } = await import("/src/schema/app-schema.ts");
                    const project = Project.fromDoc(conn.doc);

                    const items = project.items as any;
                    const len = items?.length ?? 0;

                    // Log every 2 seconds
                    const now = Date.now();
                    if (!((window as any).__lastPageCheckLog) || now - (window as any).__lastPageCheckLog > 2000) {
                        console.log(`page2: Checking for page ${pageId}, current pageCount=${len}`);
                        const pageIds: string[] = [];
                        for (let i = 0; i < len; i++) {
                            const page = items.at ? items.at(i) : items[i];
                            if (page && page.id) {
                                pageIds.push(page.id);
                            }
                        }
                        console.log(`page2: Current page IDs: ${pageIds.join(", ")}`);
                        (window as any).__lastPageCheckLog = now;
                    }

                    for (let i = 0; i < len; i++) {
                        const page = items.at ? items.at(i) : items[i];
                        if (page && page.id === pageId) {
                            console.log(`page2: Found page with ID ${pageId}`);
                            // Return the page data immediately
                            const pageItems = page.items as any;
                            const itemCount = pageItems?.length ?? 0;
                            const itemTexts: string[] = [];
                            for (let j = 0; j < itemCount; j++) {
                                const item = pageItems.at ? pageItems.at(j) : pageItems[j];
                                const text = item?.text?.toString?.() ?? "";
                                itemTexts.push(text);
                            }
                            return {
                                pageId: page.id,
                                pageTitle: page.text?.toString?.() ?? "",
                                itemCount,
                                itemTexts,
                            };
                        }
                    }
                    return null;
                } catch (e) {
                    console.error("page2: Error checking for page:", e);
                    return null;
                }
            },
            { pageId: pageInfo.pageId },
            { timeout: 30000 },
        ).then(handle => handle.jsonValue()).catch((e) => {
            console.error("page2: waitForFunction failed:", e);
            return null;
        });

        console.log("page2: Page data from waitForFunction:", page2Data);

        if (!page2Data) {
            console.error("page2: page1's page not found after 30s");
            await context1.close();
            await context2.close();
            throw new Error("Page not found in page2 after 30s");
        }

        console.log("page2: Page found, verifying data sync");

        // Verify page2 has the same page data as page1
        expect(page2Data).toBeTruthy();
        expect(page2Data?.pageId).toBe(pageInfo.pageId);
        expect(page2Data?.pageTitle).toBe(pageInfo.pageTitle);
        expect(page2Data?.itemCount).toBe(2); // We created 2 items in page1
        expect(page2Data?.itemTexts).toContain("Test Item 1");
        expect(page2Data?.itemTexts).toContain("Test Item 2");

        console.log("Page data sync verified successfully");

        await context1.close();
        await context2.close();
    });
});
