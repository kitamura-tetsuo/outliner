import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature YJS-7f2c1d3e
 *  Title   : Yjs basic map sync between two contexts
 */
import { expect, test } from "@playwright/test";

// Minimal end-to-end verification that a plain Y.Doc map synchronizes via our WS server
// This helps isolate server/provider issues from application schema complexities.

test("basic map value sync via y-websocket", async ({ browser }) => {
    const projectId = `p${Date.now().toString(16)}`;

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

    const setResult = await p1.evaluate(async (pid) => {
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
    expect(setResult).toBeTruthy();

    const ctx2 = await browser.newContext();
    const p2 = await ctx2.newPage();
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

    const connected2 = await p2.evaluate(async (pid) => {
        const { createMinimalProjectConnection } = await import("/src/lib/yjs/connection.ts");
        const conn = await createMinimalProjectConnection(pid);
        (window as any).__DOC2__ = conn.doc;
        (window as any).__PROVIDER2__ = conn.provider;
        conn.provider.on("status", (e: any) => console.log("[p2] status", e.status));
        conn.provider.on("sync", (isSynced: boolean) => console.log("[p2] sync", isSynced));

        (window as any).__UPDATES2__ = 0;
        (window as any).__UPDATES2_V2__ = 0;
        conn.doc.on("update", () => {
            (window as any).__UPDATES2__++;
            console.log("[p2] doc update");
        });
        // updateV2: より詳細なイベント、サーバ送出の経路差分を比較
        // https://docs.yjs.dev/api/document-updates#updatestructure
        // 第1引数 update は Uint8Array、第2引数 origin は送信元
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        conn.doc.on("updateV2", (_update: Uint8Array, _origin: unknown) => {
            (window as any).__UPDATES2_V2__++;
            console.log("[p2] doc updateV2");
        });
        for (let i = 0; i < 80; i++) {
            if ((conn.provider as any).wsconnected === true) break;
            await new Promise(r => setTimeout(r, 100));
        }
        return (conn.provider as any).wsconnected === true;
    }, projectId);
    expect(connected2).toBeTruthy();

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
