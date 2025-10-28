import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature YJS-7f2c1d3e
 *  Title   : Yjs basic map sync between two contexts
 */
import { expect, test } from "@playwright/test";
import { prepareTwoBrowserPages, setupUpdateTracking } from "../../src/lib/yjs/testHelpers";

// Minimal end-to-end verification that a plain Y.Doc map synchronizes via our WS server
// This helps isolate server/provider issues from application schema complexities.

test("basic map value sync via y-websocket", async ({ browser }) => {
    // Prepare two browser pages with minimal Yjs connections
    const { page1: p1, page2: p2, context1: ctx1, context2: ctx2 } = await prepareTwoBrowserPages(browser, {
        page1Prefix: "p1",
        page2Prefix: "p2",
    });

    // Set up update tracking for p2
    await setupUpdateTracking(p2, {
        docVar: "__DOC2__",
        counterVar: "__UPDATES2__",
        counterV2Var: "__UPDATES2_V2__",
    });

    const url1 = await p1.evaluate(() => (window as any).__PROVIDER__?.url ?? "");
    const p1synced = await p1.evaluate(() => (window as any).__PROVIDER__?.synced ?? false);
    const p2synced = await p2.evaluate(() => (window as any).__PROVIDER2__?.synced ?? false);
    console.log("[yjs-basic] p1 synced:", p1synced, "p2 synced:", p2synced);

    const url2 = await p2.evaluate(() => (window as any).__PROVIDER2__?.url ?? "");
    console.log("[yjs-basic] p1 url:", (url1 as string).slice(0, 100));
    console.log("[yjs-basic] p2 url:", (url2 as string).slice(0, 100));

    // wait up to ~8s for initial sync to complete on both sides
    await p1.waitForFunction(() => (window as any).__PROVIDER__?.synced === true, null, { timeout: 8000 }).catch(() =>
        undefined
    );
    await p2.waitForFunction(() => (window as any).__PROVIDER2__?.synced === true, null, { timeout: 8000 }).catch(() =>
        undefined
    );

    await p1.evaluate(() => {
        const d = (window as any).__DOC__;
        d.getMap("m").set("k", "v1");
    });
    const localValue = await p1.evaluate(() => (window as any).__DOC__.getMap("m").get("k"));
    console.log("[yjs-basic] p1 local value:", localValue);

    const value = await p2.evaluate(async () => {
        const m = (window as any).__DOC2__.getMap("m");
        for (let i = 0; i < 80; i++) { // ~8s
            const v = m.get("k");
            if (v !== undefined) return v;
            await new Promise(r => setTimeout(r, 100));
        }
        return m.get("k");
    });

    const updates2 = await p2.evaluate(() => (window as any).__UPDATES2__);
    const updates2v2 = await p2.evaluate(() => (window as any).__UPDATES2_V2__ ?? 0);
    console.log("[yjs-basic] p2 update events:", updates2, "updateV2:", updates2v2);

    expect(value).toBe("v1");

    await ctx1.close();
    await ctx2.close();
});
