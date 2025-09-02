/** @feature EVC-9c85e4b2
 * Title   : Evict expired tokens from WebSocket auth cache
 * Source  : docs/client-features/evc-evict-expired-tokens-9c85e4b2.yaml
 */
import { expect, test } from "@playwright/test";
import admin from "firebase-admin";
import sinon from "sinon";

test.describe("websocket token cache eviction", () => {
    test.afterEach(() => {
        sinon.restore();
    });

    test("evicts expired tokens", async () => {
        const mod = await import("../../../server/src/websocket-auth.ts");
        const { verifyIdTokenCached, clearTokenCache, getTokenCacheSize } = mod;
        const stub = sinon.stub(admin.auth(), "verifyIdToken").resolves({
            uid: "u1",
            exp: Math.floor(Date.now() / 1000) + 1,
        });
        await verifyIdTokenCached("short");
        expect(getTokenCacheSize()).toBe(1);
        await new Promise((r) => setTimeout(r, 1100));
        await verifyIdTokenCached("short");
        expect(stub.calledTwice).toBe(true);
        expect(getTokenCacheSize()).toBe(1);
        clearTokenCache();
    });
});
