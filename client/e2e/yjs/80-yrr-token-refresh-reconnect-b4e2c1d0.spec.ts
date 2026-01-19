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
test.setTimeout(120_000);

test.describe("YJS token refresh reconnect", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // Force Yjs WS for this spec (TestHelpers defaults to WS disabled)
        await TestHelpers.prepareTestEnvironment(page, testInfo, [], undefined, { ws: "force" });
    });

    test("reconnects after token refresh", async ({ page }) => {
        const projectId = `p-${Date.now()}`;
        await page.evaluate(async pid => {
            // @ts-expect-error - resolved by Vite in browser
            const { createProjectConnection } = await import("/src/lib/yjs/connection.ts");
            const conn = await createProjectConnection(pid);
            (window as any).__CONN__ = conn;

            // Listen for status changes to detect disconnect
            const provider = conn.provider;
            let disconnectResolve: () => void;
            // eslint-disable-next-line no-restricted-globals
            (window as any).__DISCONNECT_PROMISE__ = new Promise<void>(resolve => {
                disconnectResolve = resolve;
            });
            provider.on("disconnect", () => {
                console.log("Provider emitted disconnect event");
                disconnectResolve?.();
            });
            provider.on("status", (event: { status: string; }) => {
                console.log("Status changed to:", event.status);
            });
        }, projectId);

        await page.waitForFunction(() => {
            const p = (window as any).__CONN__?.provider;
            // HocuspocusProvider stores status in configuration.websocketProvider.status
            const wsStatus = p?.configuration?.websocketProvider?.status;
            return p?.isSynced === true || wsStatus === "connected";
        });
        await page.evaluate(() => {
            (window as any).__CONN__.provider.disconnect();
        });
        // Wait for disconnect event with timeout
        // eslint-disable-next-line no-restricted-globals
        await page.waitForFunction(() => (window as any).__DISCONNECT_PROMISE__, undefined, { timeout: 10000 });
        // After disconnect, verify status using configuration.websocketProvider.status
        // HocuspocusProvider stores websocketProvider in configuration.websocketProvider
        const status = await page.evaluate(() =>
            // eslint-disable-next-line no-restricted-globals
            (window as any).__CONN__.provider.configuration?.websocketProvider?.status
        );
        expect(status).toBe("disconnected");
        await page.evaluate(async () => {
            await (window as any).__USER_MANAGER__.refreshToken();
        });
        await page.waitForFunction(() => {
            const p = (window as any).__CONN__.provider;
            // HocuspocusProvider stores status in configuration.websocketProvider.status
            const wsStatus = p?.configuration?.websocketProvider?.status;
            return p.isSynced === true || wsStatus === "connected";
        });
        // HocuspocusProvider stores status in configuration.websocketProvider.status
        const isConnected = await page.evaluate(() =>
            // eslint-disable-next-line no-restricted-globals
            (window as any).__CONN__.provider.configuration?.websocketProvider?.status === "connected"
        );
        expect(isConnected).toBeTruthy();
    });

    test("updates auth param when token changes", async ({ page }) => {
        const projectId = `p-${Date.now()}-upd`;
        await page.evaluate(async pid => {
            // @ts-expect-error - resolved by Vite in browser
            const { createProjectConnection } = await import("/src/lib/yjs/connection.ts");
            const conn = await createProjectConnection(pid);
            (window as any).__CONN__ = conn;

            // Spy on sendToken to verify it's called
            const originalSendToken = conn.provider.sendToken.bind(conn.provider);
            conn.provider.sendToken = async () => {
                // eslint-disable-next-line no-restricted-globals
                (window as any).__SEND_TOKEN_CALLED__ = true;
                return originalSendToken();
            };
        }, projectId);

        await page.waitForFunction(() => {
            const p = (window as any).__CONN__?.provider;
            // HocuspocusProvider stores status in configuration.websocketProvider.status
            const wsStatus = p?.configuration?.websocketProvider?.status;
            return p?.isSynced === true || wsStatus === "connected";
        });

        await page.evaluate(async () => {
            await (window as any).__USER_MANAGER__.refreshToken();
        });

        // eslint-disable-next-line no-restricted-globals
        await page.waitForFunction(() => (window as any).__SEND_TOKEN_CALLED__ === true);
        // eslint-disable-next-line no-restricted-globals
        const tokenRefreshed = await page.evaluate(() => (window as any).__SEND_TOKEN_CALLED__);
        expect(tokenRefreshed).toBe(true);
    });
});
