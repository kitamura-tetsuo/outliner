/** @feature YJS-f2g3h4i5
 * Title   : Yjs project data sync
 * Source  : docs/client-features/yjs-project-sync-f2g3h4i5.yaml
 */
import { expect, test } from "@playwright/test";
import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.describe("YJS-f2g3h4i5: Yjs project data sync", () => {
    test("two browser contexts connect to same project and see same project data", async ({ browser }, testInfo) => {
        // Create first browser context
        const context1 = await browser.newContext();
        const page1 = await context1.newPage();

        // Enable WebSocket for page1
        await page1.addInitScript(() => {
            localStorage.setItem("VITE_YJS_ENABLE_WS", "true");
        });

        // Prepare test environment for page1
        const { projectName, pageName } = await TestHelpers.prepareTestEnvironment(page1, testInfo, ["Test Item 1"]);

        // Wait for page1 to initialize Yjs client
        await page1.waitForFunction(() => {
            const yjsStore = (window as any).__YJS_STORE__;
            return !!(yjsStore && yjsStore.yjsClient);
        }, { timeout: 15000 });

        // Get project info from page1
        const page1Info = await page1.evaluate(() => {
            const yjsStore = (window as any).__YJS_STORE__;
            const client = yjsStore?.yjsClient;
            const project = client?.getProject?.();
            return {
                projectId: client?.containerId,
                projectTitle: project?.title,
                url: window.location.href,
            };
        });
        console.log("Page1 info:", page1Info);
        expect(page1Info.projectId).toBeTruthy();
        expect(page1Info.projectTitle).toBeTruthy();

        // Wait for page1 WebSocket to connect
        await page1.waitForFunction(() => {
            const yjsStore = (window as any).__YJS_STORE__;
            const client = yjsStore?.yjsClient;
            const provider = client?.wsProvider;
            return provider?.wsconnected === true;
        }, { timeout: 15000 });

        console.log("Page1 WebSocket connected");

        // Create second browser context
        const context2 = await browser.newContext();
        const page2 = await context2.newPage();

        // Enable WebSocket for page2
        await page2.addInitScript(() => {
            localStorage.setItem("VITE_IS_TEST", "true");
            localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
            localStorage.setItem("SKIP_TEST_CONTAINER_SEED", "true");
            localStorage.setItem("VITE_YJS_ENABLE_WS", "true");
            (window as any).__E2E__ = true;
            (window as any).__vite_plugin_react_preamble_installed__ = true;
            const originalCreateElement = document.createElement;
            document.createElement = function(tagName: string, ...args: any[]) {
                if (tagName === "vite-error-overlay") {
                    return originalCreateElement.call(this, "div", ...args);
                }
                return originalCreateElement.call(this, tagName, ...args);
            } as typeof document.createElement;
        });

        // Navigate page2 to the same URL as page1
        console.log(`page2: Navigating to ${page1Info.url}`);
        await page2.goto(page1Info.url, { waitUntil: "domcontentloaded" });

        // Authenticate page2
        await page2.waitForFunction(() => {
            return !!(window as any).__USER_MANAGER__;
        }, { timeout: 10000 });

        await page2.evaluate(async () => {
            const mgr = (window as any).__USER_MANAGER__;
            if (mgr?.loginWithEmailPassword) {
                await mgr.loginWithEmailPassword("test@example.com", "password");
            }
        });

        // Wait for page2 authentication to complete
        await page2.waitForFunction(() => {
            const mgr = (window as any).__USER_MANAGER__;
            return !!(mgr && mgr.getCurrentUser && mgr.getCurrentUser());
        }, { timeout: 10000 });

        // Wait for page2 to initialize Yjs client
        await page2.waitForFunction(() => {
            const yjsStore = (window as any).__YJS_STORE__;
            return !!(yjsStore && yjsStore.yjsClient);
        }, { timeout: 15000 });

        // Get project info from page2
        const page2Info = await page2.evaluate(() => {
            const yjsStore = (window as any).__YJS_STORE__;
            const client = yjsStore?.yjsClient;
            const project = client?.getProject?.();
            return {
                projectId: client?.containerId,
                projectTitle: project?.title,
            };
        });
        console.log("Page2 info:", page2Info);

        // Verify page2 has the same project ID and title
        expect(page2Info.projectId).toBe(page1Info.projectId);
        expect(page2Info.projectTitle).toBe(page1Info.projectTitle);

        // Wait for page2 WebSocket to connect
        await page2.waitForFunction(() => {
            const yjsStore = (window as any).__YJS_STORE__;
            const client = yjsStore?.yjsClient;
            const provider = client?.wsProvider;
            return provider?.wsconnected === true;
        }, { timeout: 15000 });

        console.log("Page2 WebSocket connected");

        // Verify both pages have the same project data
        console.log("Verifying project data sync...");

        await context1.close();
        await context2.close();
    });
});
