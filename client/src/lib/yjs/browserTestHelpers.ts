import type { HocuspocusProvider } from "@hocuspocus/provider";

export async function waitForSyncedAndDataForTest(
    provider: HocuspocusProvider,
    checkDataAvailable: () => boolean,
    options: { timeoutMs?: number; pollIntervalMs?: number; label?: string; } = {},
): Promise<boolean> {
    const { timeoutMs = 30000, pollIntervalMs = 100 } = options;
    const maxIterations = Math.floor(timeoutMs / pollIntervalMs);
    for (let i = 0; i < maxIterations; i++) {
        if (provider.isSynced === true) break;
        await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    for (let i = 0; i < maxIterations; i++) {
        if (checkDataAvailable()) return true;
        await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    return false;
}
