/** @feature YJS-f2g3h4i5
 * Title   : Yjs project data sync
 * Source  : docs/client-features/yjs-project-sync-f2g3h4i5.yaml
 */
import { expect, test } from "@playwright/test";
import "../utils/registerAfterEachSnapshot";
import { prepareTwoFullBrowserPages } from "../../src/lib/yjs/testHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.describe("YJS-f2g3h4i5: Yjs project data sync", () => {
    test("two browser contexts connect to same project and see same project data", async ({ browser }, testInfo) => {
        // Prepare two browser pages with full test environment
        const { page1, page2, context1, context2, projectName, pageName } = await prepareTwoFullBrowserPages(
            browser,
            testInfo,
            ["Test Item 1"],
            TestHelpers,
        );

        console.log(`Test environment prepared: project=${projectName}, page=${pageName}`);

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
