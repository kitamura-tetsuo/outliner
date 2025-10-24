import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature YRR-b4e2c1d0
 *  Title   : YJS token refresh reconnect
 *  Source  : docs/client-features/yrr-room-token-refresh-reconnect-b4e2c1d0.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

// Shorten per-spec timeout (default 240s is too long for this scenario)
import { test as base } from "@playwright/test";
base.setTimeout(120_000);

// Force Yjs WS for this spec (TestHelpers defaults to WS disabled)
test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        try {
            localStorage.setItem("VITE_YJS_FORCE_WS", "true");
            localStorage.setItem("VITE_YJS_ENABLE_WS", "true");
        } catch {}
    });
});

test.describe("YJS token refresh reconnect", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("reconnects after token refresh", async ({ page }) => {
        const projectId = `p-${Date.now()}`;
        await page.evaluate(async pid => {
            // @ts-ignore - resolved by Vite in browser
            const { createProjectConnection } = await import("/src/lib/yjs/connection.ts");
            const conn = await createProjectConnection(pid);
            (window as any).__CONN__ = conn;
        }, projectId);

        await page.waitForFunction(() => (window as any).__CONN__?.provider.wsconnected === true);
        await page.evaluate(() => {
            (window as any).__CONN__.provider.disconnect();
        });
        await page.waitForFunction(() => (window as any).__CONN__.provider.wsconnected === false);
        await page.evaluate(async () => {
            await (window as any).__USER_MANAGER__.refreshToken();
        });
        await page.waitForFunction(() => (window as any).__CONN__.provider.wsconnected === true);
        const authParam = await page.evaluate(() => (window as any).__CONN__.provider.params.auth);
        expect(authParam).toBeTruthy();
    });

    test("updates auth param when token changes", async ({ page }) => {
        const projectId = `p-${Date.now()}-upd`;
        await page.evaluate(async pid => {
            // @ts-ignore - resolved by Vite in browser
            const { createProjectConnection } = await import("/src/lib/yjs/connection.ts");
            const conn = await createProjectConnection(pid);
            (window as any).__CONN__ = conn;
        }, projectId);

        await page.waitForFunction(() => (window as any).__CONN__?.provider.wsconnected === true);
        const initialAuth = await page.evaluate(() => (window as any).__CONN__.provider.params.auth);
        await page.evaluate(async () => {
            await (window as any).__USER_MANAGER__.refreshToken();
        });
        await page.waitForFunction(initial => (window as any).__CONN__.provider.params.auth !== initial, initialAuth);
        const newAuth = await page.evaluate(() => (window as any).__CONN__.provider.params.auth);
        expect(newAuth).toBeTruthy();
        expect(newAuth).not.toEqual(initialAuth);
    });
});
