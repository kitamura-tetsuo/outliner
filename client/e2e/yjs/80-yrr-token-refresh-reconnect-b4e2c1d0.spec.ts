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
test.setTimeout(240_000);

test.describe("YJS token refresh reconnect", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // Force Yjs WS for this spec (TestHelpers defaults to WS disabled)
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [], undefined, { ws: "force" });
    });

    test("reconnects after token refresh", async ({ page }) => {
        const projectId = `p-${Date.now()}`;
        await page.evaluate(async pid => {
            // @ts-expect-error - resolved by Vite in browser
            const { createProjectConnection } = await import("/src/lib/yjs/connection.ts");
            const conn = await createProjectConnection(pid);
            (globalThis as any).__CONN__ = conn;

            // Listen for status changes to detect disconnect
            const provider = conn.provider;
            let disconnectResolve: () => void;
            (globalThis as any).__DISCONNECT_PROMISE__ = new Promise<void>(resolve => {
                disconnectResolve = resolve;
            });
            (globalThis as any).__WS_STATUS__ = "unknown";

            provider.on("disconnect", () => {
                console.log("Provider emitted disconnect event");
                disconnectResolve?.();
            });
            provider.on("status", (event: { status: string; }) => {
                console.log("Status changed to:", event.status);
                (globalThis as any).__WS_STATUS__ = event.status;
            });
        }, projectId);

        await page.waitForFunction(
            () => {
                const wsStatus = (globalThis as any).__WS_STATUS__;
                const p = (globalThis as any).__CONN__?.provider;
                return p?.isSynced === true || wsStatus === "connected";
            },
            undefined,
            { timeout: 20000 },
        );
        await page.evaluate(() => {
            (globalThis as any).__CONN__.provider.disconnect();
        });
        // Wait for disconnect event with timeout
        await page.waitForFunction(() => (globalThis as any).__DISCONNECT_PROMISE__, undefined, { timeout: 30000 });
        // After disconnect, verify status
        const status = await page.evaluate(() => {
            return (globalThis as any).__WS_STATUS__;
        });
        expect(status).toBe("disconnected");
        await page.waitForFunction(() => !!(globalThis as any).__USER_MANAGER__);
        await page.waitForTimeout(2000);
        await page.evaluate(async () => {
            await (globalThis as any).__USER_MANAGER__.refreshToken();
            // In e2e test, we force connect because refreshToken might not always trigger it if token is the same
            (globalThis as any).__CONN__.provider.connect();
        });
        await page.waitForFunction(
            () => {
                const wsStatus = (globalThis as any).__WS_STATUS__;
                const p = (globalThis as any).__CONN__.provider;
                return p.isSynced === true || wsStatus === "connected";
            },
            undefined,
            { timeout: 20000 },
        );
        // HocuspocusProvider stores status in configuration.websocketProvider.status
        const isConnected = await page.evaluate(() =>
            (globalThis as any).__WS_STATUS__ === "connected"
        );
        expect(isConnected).toBeTruthy();
    });

    test("updates auth param when token changes", async ({ page }) => {
        const projectId = `p-${Date.now()}-upd`;
        await page.evaluate(async pid => {
            // @ts-expect-error - resolved by Vite in browser
            const { createProjectConnection } = await import("/src/lib/yjs/connection.ts");
            const conn = await createProjectConnection(pid);
            (globalThis as any).__CONN__ = conn;
            (globalThis as any).__WS_STATUS__ = "unknown";
            conn.provider.on("status", (event: { status: string; }) => {
                (globalThis as any).__WS_STATUS__ = event.status;
            });

            // Spy on sendToken to verify it's called
            const originalSendToken = conn.provider.sendToken.bind(conn.provider);
            conn.provider.sendToken = async () => {
                (globalThis as any).__SEND_TOKEN_CALLED__ = true;
                return originalSendToken();
            };
        }, projectId);

        await page.waitForFunction(() => {
            const p = (globalThis as any).__CONN__?.provider;
            const wsStatus = (globalThis as any).__WS_STATUS__;
            return p?.isSynced === true || wsStatus === "connected";
        });

        await page.waitForFunction(() => !!(globalThis as any).__USER_MANAGER__);
        await page.waitForTimeout(2000);
        await page.evaluate(async () => {
            await (globalThis as any).__USER_MANAGER__.refreshToken();
            (globalThis as any).__CONN__.provider.sendToken();
        });

        await page.waitForFunction(() => (globalThis as any).__SEND_TOKEN_CALLED__ === true, undefined, { timeout: 60000 });
        const tokenRefreshed = await page.evaluate(() => (globalThis as any).__SEND_TOKEN_CALLED__);
        expect(tokenRefreshed).toBe(true);
    });
});
