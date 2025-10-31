import { expect, test } from "@playwright/test";
import { createMinimalYjsConnection, initializeBrowserPage, setupUpdateTracking } from "../../src/lib/yjs/testHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

// One-off: connection order test
// p1 connects -> set value -> p2 connects; verify initial sync delivers value

test("order: p1 connect->set then p2 connect for initial sync", async ({ browser }) => {
    const projectId = `p${Date.now().toString(16)}`;

    // Initialize first page
    const { context: ctx1, page: p1 } = await initializeBrowserPage(browser, {
        enableWebSocket: true,
        requireAuth: true,
        consolePrefix: "p1",
    });

    // Create minimal Yjs connection for p1
    const p1Connected = await createMinimalYjsConnection(p1, projectId, {
        docVar: "__DOC__",
        providerVar: "__PROVIDER__",
    });
    expect(p1Connected).toBeTruthy();

    // p1 sets value before p2 connects
    await p1.evaluate(() => {
        const d = (window as any).__DOC__;
        d.getMap("m").set("k", "v1");
    });

    // Initialize second page
    const { context: ctx2, page: p2 } = await initializeBrowserPage(browser, {
        enableWebSocket: true,
        requireAuth: true,
        consolePrefix: "p2",
    });

    // Create minimal Yjs connection for p2
    const p2Connected = await createMinimalYjsConnection(p2, projectId, {
        docVar: "__DOC2__",
        providerVar: "__PROVIDER2__",
    });
    expect(p2Connected).toBeTruthy();

    // Set up update tracking for p2
    await setupUpdateTracking(p2, {
        docVar: "__DOC2__",
        counterVar: "__UPDATES2__",
        counterV2Var: "__UPDATES2_V2__",
    });

    // Log provider.synced transitions
    await p2.evaluate(() => {
        const provider = (window as any).__PROVIDER2__;
        provider.on("sync", (s: boolean) => {
            console.log(`[p2] provider.synced=${s}`);
        });
        console.log(`[p2] initial provider.synced=${provider.synced}`);
    });

    // Wait for both provider.synced and actual data to be available using the test utility function
    const value = await p2.evaluate(async () => {
        // @ts-expect-error - Browser context import resolved by Vite
        const { waitForSyncedAndDataForTest } = await import("/src/lib/yjs/testHelpers.ts");
        const provider = (window as any).__PROVIDER2__;
        const m = (window as any).__DOC2__.getMap("m");

        // Use the test-specific utility to wait for sync and data
        await waitForSyncedAndDataForTest(
            provider,
            () => m.get("k") !== undefined,
            { label: "p2-order-sync" },
        );

        return m.get("k");
    });

    const updates2 = await p2.evaluate(() => (window as any).__UPDATES2__);
    const updates2v2 = await p2.evaluate(() => (window as any).__UPDATES2_V2__ ?? 0);
    console.log("[yjs-order] p2 update events:", updates2, "updateV2:", updates2v2);

    expect(value).toBe("v1");

    await ctx1.close();
    await ctx2.close();
});
