import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature YJS-0b7e4a12
 *  Title   : Yjs initial sync when p2 connects after p1 update
 */
import { expect, test } from "@playwright/test";

test("initial sync on late join (p1 connect -> update -> p2 connect)", async ({ browser }) => {
    const projectId = `p${Date.now().toString(16)}`;

    // p1: connect first
    const ctx1 = await browser.newContext();
    const p1 = await ctx1.newPage();
    p1.on("console", m => console.log("[p1 console]", m.text().slice(0, 100)));
    await p1.addInitScript(() => {
        localStorage.setItem("VITE_IS_TEST", "true");
        localStorage.setItem("VITE_YJS_ENABLE_WS", "true");
        localStorage.setItem("VITE_DISABLE_YJS_INDEXEDDB", "true");
        localStorage.setItem("VITE_YJS_REQUIRE_AUTH", "true");
    });
    await p1.goto("http://localhost:7090/", { waitUntil: "domcontentloaded" });
    await p1.waitForFunction(() => !!(window as any).__USER_MANAGER__, null, { timeout: 10000 });
    await p1.evaluate(async () => {
        const mgr = (window as any).__USER_MANAGER__;
        await mgr?.loginWithEmailPassword?.("test@example.com", "password");
    });
    await p1.waitForFunction(() => !!(window as any).__USER_MANAGER__?.getCurrentUser?.(), null, { timeout: 10000 });

    const p1Connected = await p1.evaluate(async (pid) => {
        const { createMinimalProjectConnection } = await import("/src/lib/yjs/connection.ts");
        const conn = await createMinimalProjectConnection(pid);
        (window as any).__DOC__ = conn.doc;
        (window as any).__PROVIDER__ = conn.provider;
        conn.provider.on("status", (e: any) => console.log("[p1] status", e.status));
        conn.provider.on("sync", (isSynced: boolean) => console.log("[p1] sync", isSynced));
        for (let i = 0; i < 80; i++) {
            if ((conn.provider as any).wsconnected === true) break;
            await new Promise(r => setTimeout(r, 100));
        }
        return (conn.provider as any).wsconnected === true;
    }, projectId);
    expect(p1Connected).toBeTruthy();

    // p1 updates before p2 joins
    await p1.evaluate(() => {
        const d = (window as any).__DOC__;
        d.getMap("m").set("k", "v0");
    });
    const p1Local = await p1.evaluate(() => (window as any).__DOC__.getMap("m").get("k"));
    console.log("[variant] p1 local:", p1Local);

    // p2: join after the update
    const ctx2 = await browser.newContext();
    const p2 = await ctx2.newPage();
    p2.on("console", m => console.log("[p2 console]", m.text().slice(0, 100)));

    await p2.addInitScript(() => {
        localStorage.setItem("VITE_IS_TEST", "true");
        localStorage.setItem("VITE_YJS_ENABLE_WS", "true");
        localStorage.setItem("VITE_DISABLE_YJS_INDEXEDDB", "true");
        localStorage.setItem("VITE_YJS_REQUIRE_AUTH", "true");
    });
    await p2.goto("http://localhost:7090/", { waitUntil: "domcontentloaded" });
    await p2.waitForFunction(() => !!(window as any).__USER_MANAGER__, null, { timeout: 10000 });
    await p2.evaluate(async () => {
        const mgr = (window as any).__USER_MANAGER__;
        await mgr?.loginWithEmailPassword?.("test@example.com", "password");
    });
    await p2.waitForFunction(() => !!(window as any).__USER_MANAGER__?.getCurrentUser?.(), null, { timeout: 10000 });

    const p2Connected = await p2.evaluate(async (pid) => {
        const { createMinimalProjectConnection } = await import("/src/lib/yjs/connection.ts");
        const conn = await createMinimalProjectConnection(pid);
        (window as any).__DOC2__ = conn.doc;
        (window as any).__PROVIDER2__ = conn.provider;
        (window as any).__UPDATES2__ = 0;
        (window as any).__UPDATES2_V2__ = 0;
        conn.doc.on("update", () => {
            (window as any).__UPDATES2__++;
            console.log("[p2] doc update");
        });
        conn.doc.on("updateV2", (_u: Uint8Array) => {
            (window as any).__UPDATES2_V2__++;
            console.log("[p2] doc updateV2");
        });

        // Log provider.synced transitions
        conn.provider.on("sync", (s: boolean) => {
            console.log(`[p2] provider.synced=${s}`);
        });
        console.log(`[p2] initial provider.synced=${conn.provider.synced}`);

        for (let i = 0; i < 80; i++) {
            if ((conn.provider as any).wsconnected === true) break;
            await new Promise(r => setTimeout(r, 100));
        }
        return (conn.provider as any).wsconnected === true;
    }, projectId);
    expect(p2Connected).toBeTruthy();

    // Wait for both provider.synced and actual data to be available using the utility function
    const v = await p2.evaluate(async () => {
        const { waitForSyncedAndData } = await import("/src/lib/yjs/connection.ts");
        const prov = (window as any).__PROVIDER2__;
        const m = (window as any).__DOC2__.getMap("m");

        // Use the encapsulated best practice pattern
        await waitForSyncedAndData(
            prov,
            () => m.get("k") !== undefined,
            { label: "p2-initial-sync-variant" },
        );

        return m.get("k");
    });
    const updates2 = await p2.evaluate(() => (window as any).__UPDATES2__);
    const updates2v2 = await p2.evaluate(() => (window as any).__UPDATES2_V2__ ?? 0);
    console.log("[variant] p2 value:", v, "updates:", updates2, "updateV2:", updates2v2);

    expect(v).toBe("v0");

    await ctx1.close();
    await ctx2.close();
});
