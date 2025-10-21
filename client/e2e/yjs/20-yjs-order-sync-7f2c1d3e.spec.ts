import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

// One-off: connection order test
// p1 connects -> set value -> p2 connects; verify initial sync delivers value

test("order: p1 connect->set then p2 connect for initial sync", async ({ browser }) => {
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

    const p1Connected = await p1.evaluate(async (pid) => {
        const { createMinimalProjectConnection } = await import("/src/lib/yjs/connection.ts");
        const conn = await createMinimalProjectConnection(pid);
        (window as any).__DOC__ = conn.doc;
        (window as any).__PROVIDER__ = conn.provider;
        conn.provider.on("status", (e: any) => console.log("[p1] status", e.status));
        for (let i = 0; i < 80; i++) {
            if ((conn.provider as any).wsconnected === true) break;
            await new Promise(r => setTimeout(r, 100));
        }
        return (conn.provider as any).wsconnected === true;
    }, projectId);
    expect(p1Connected).toBeTruthy();

    // p1 sets value before p2 connects
    await p1.evaluate(() => {
        const d = (window as any).__DOC__;
        d.getMap("m").set("k", "v1");
    });

    // Now connect p2 and verify it receives the initial value (no broadcast needed)
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
        conn.doc.on("update", () => (window as any).__UPDATES2__++);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        conn.doc.on("updateV2", (_u: Uint8Array, _o: unknown) => (window as any).__UPDATES2_V2__++);

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

    // Wait for both provider.synced and actual data to be available
    const value = await p2.evaluate(async () => {
        const provider = (window as any).__PROVIDER2__;
        const m = (window as any).__DOC2__.getMap("m");

        // First, wait for provider.synced
        for (let i = 0; i < 300; i++) { // up to ~30s
            if (provider.synced === true) {
                console.log(`[p2] provider.synced=true after ${i * 100}ms`);
                break;
            }
            await new Promise(r => setTimeout(r, 100));
        }

        // Then, wait for the actual value to be available
        for (let i = 0; i < 300; i++) { // up to ~30s
            const v = m.get("k");
            if (v !== undefined) {
                console.log(`[p2] value available after ${i * 100}ms from synced`);
                return v;
            }
            await new Promise(r => setTimeout(r, 100));
        }

        console.log(`[p2] value NOT available after 30s, synced=${provider.synced}`);
        return m.get("k");
    });

    const updates2 = await p2.evaluate(() => (window as any).__UPDATES2__);
    const updates2v2 = await p2.evaluate(() => (window as any).__UPDATES2_V2__ ?? 0);
    console.log("[yjs-order] p2 update events:", updates2, "updateV2:", updates2v2);

    expect(value).toBe("v1");

    await ctx1.close();
    await ctx2.close();
});
