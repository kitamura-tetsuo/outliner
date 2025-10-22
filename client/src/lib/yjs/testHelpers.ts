/**
 * Yjs Test Helpers
 *
 * Test-specific utilities for Yjs synchronization testing.
 * These helpers are designed for E2E tests where immediate data verification is required.
 *
 * ⚠️ WARNING: These utilities are for TEST ENVIRONMENTS ONLY.
 * Do NOT use these patterns in production code.
 *
 * Production code should rely on Y.Doc observe events and reactive UI updates
 * instead of polling for data availability.
 */

import type { WebsocketProvider } from "y-websocket";

/**
 * Wait for both provider.synced and actual data availability in Y.Doc.
 *
 * This function addresses a race condition in y-websocket 2.x where provider.synced
 * can become true before the actual data is available in Y.Doc.
 *
 * ⚠️ TEST ENVIRONMENT ONLY
 * This is a test-specific utility for scenarios where you need to immediately verify
 * data after synchronization. In production code, use Y.Doc observe events instead.
 *
 * @param provider - The WebsocketProvider instance to monitor
 * @param checkDataAvailable - Function that returns true when the expected data is available
 * @param options - Configuration options
 * @param options.timeoutMs - Maximum time to wait in milliseconds (default: 30000)
 * @param options.pollIntervalMs - Polling interval in milliseconds (default: 100)
 * @param options.label - Label for debug logging (default: "yjs-sync")
 * @returns Promise that resolves to true if data is available, false if timeout
 *
 * @example
 * ```typescript
 * // In E2E test
 * const value = await page.evaluate(async () => {
 *     const { waitForSyncedAndDataForTest } = await import("/src/lib/yjs/testHelpers.ts");
 *     const provider = (window as any).__PROVIDER__;
 *     const m = (window as any).__DOC__.getMap("m");
 *
 *     await waitForSyncedAndDataForTest(
 *         provider,
 *         () => m.get("key") !== undefined,
 *         { label: "test-sync" }
 *     );
 *
 *     return m.get("key");
 * });
 * expect(value).toBe("expected-value");
 * ```
 */
export async function waitForSyncedAndDataForTest(
    provider: WebsocketProvider,
    checkDataAvailable: () => boolean,
    options: {
        timeoutMs?: number;
        pollIntervalMs?: number;
        label?: string;
    } = {},
): Promise<boolean> {
    const {
        timeoutMs = 30000,
        pollIntervalMs = 100,
        label = "yjs-sync",
    } = options;

    const maxIterations = Math.floor(timeoutMs / pollIntervalMs);
    const debugEnabled = isConnDebugEnabled();

    // Step 1: Wait for provider.synced
    for (let i = 0; i < maxIterations; i++) {
        if (provider.synced === true) {
            if (debugEnabled) {
                console.log(`[${label}] provider.synced=true after ${i * pollIntervalMs}ms`);
            }
            break;
        }
        await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    // Step 2: Wait for actual data to be available
    for (let i = 0; i < maxIterations; i++) {
        if (checkDataAvailable()) {
            if (debugEnabled) {
                console.log(`[${label}] data available after ${i * pollIntervalMs}ms from synced`);
            }
            return true;
        }
        await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    if (debugEnabled) {
        console.log(
            `[${label}] timeout after ${timeoutMs}ms, synced=${provider.synced}, dataAvailable=${checkDataAvailable()}`,
        );
    }
    return false;
}

/**
 * Check if connection debugging is enabled.
 * This is used to control verbose logging in test environments.
 */
function isConnDebugEnabled(): boolean {
    if (typeof window !== "undefined") {
        return localStorage.getItem("VITE_YJS_CONN_DEBUG") === "true";
    }
    return false;
}
