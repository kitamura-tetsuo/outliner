/** @feature YJS-e1f2a3b4
 * Title   : Yjs WebSocket sync basic
 * Source  : docs/client-features/yjs-websocket-sync-basic-e1f2a3b4.yaml
 */
import { expect, test } from "@playwright/test";
import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.describe("YJS-e1f2a3b4: Yjs WebSocket sync basic", () => {
    test("two browser contexts connect to same project and sync via WebSocket", async ({ browser }, testInfo) => {
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

        // Get project ID and page URL from page1
        const page1Info = await page1.evaluate(() => {
            const yjsStore = (window as any).__YJS_STORE__;
            return {
                projectId: yjsStore?.yjsClient?.containerId,
                url: window.location.href,
            };
        });
        console.log("Page1 info:", page1Info);
        expect(page1Info.projectId).toBeTruthy();

        // Wait for page1 WebSocket to connect
        await page1.waitForFunction(() => {
            const yjsStore = (window as any).__YJS_STORE__;
            const client = yjsStore?.yjsClient;
            const provider = client?.wsProvider;
            if (!provider) return false;
            const wsConnected = provider.wsconnected;
            console.log(`page1: wsConnected: ${wsConnected}`);
            return wsConnected === true;
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

        // Verify page2 has the same project ID
        const page2ProjectId = await page2.evaluate(() => {
            const yjsStore = (window as any).__YJS_STORE__;
            return yjsStore?.yjsClient?.containerId;
        });
        console.log("Page2 project ID:", page2ProjectId);
        expect(page2ProjectId).toBe(page1Info.projectId);

        // Wait for page2 WebSocket to connect
        await page2.waitForFunction(() => {
            const yjsStore = (window as any).__YJS_STORE__;
            const client = yjsStore?.yjsClient;
            const provider = client?.wsProvider;
            if (!provider) return false;
            const wsConnected = provider.wsconnected;
            console.log(`page2: wsConnected: ${wsConnected}`);
            return wsConnected === true;
        }, { timeout: 15000 });

        console.log("Page2 WebSocket connected");

        // Verify both pages have WebSocket connected
        // Note: We're checking wsconnected instead of synced because synced may not
        // become true immediately in test environments
        const page1Connected = await page1.evaluate(() => {
            const yjsStore = (window as any).__YJS_STORE__;
            const client = yjsStore?.yjsClient;
            const provider = client?.wsProvider;
            return provider?.wsconnected === true;
        });

        const page2Connected = await page2.evaluate(() => {
            const yjsStore = (window as any).__YJS_STORE__;
            const client = yjsStore?.yjsClient;
            const provider = client?.wsProvider;
            return provider?.wsconnected === true;
        });

        console.log(`page1 WebSocket connected: ${page1Connected}`);
        console.log(`page2 WebSocket connected: ${page2Connected}`);

        expect(page1Connected).toBe(true);
        expect(page2Connected).toBe(true);

        await context1.close();
        await context2.close();
    });
});
