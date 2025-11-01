import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature API-0002
 *  Title   : Firebase emulator起動待機機能
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";

// Utility function to retry request until success or timeout
async function waitForHealth(request: import("@playwright/test").APIRequestContext, attempts = 10) {
    for (let i = 0; i < attempts; i++) {
        try {
            const response = await request.get("http://localhost:57000/health");
            if (response.ok()) {
                return response;
            }
        } catch (error) {
            console.log(`Attempt ${i + 1}/${attempts} failed:`, error instanceof Error ? error.message : String(error));
        }
        await new Promise(res => setTimeout(res, 1000));
    }
    throw new Error("Health endpoint did not respond in time");
}

test.describe("API-0002: emulator wait-and-retry", () => {
    // API tests don't need page preparation

    test("server becomes available after retries", async ({ request }) => {
        const response = await waitForHealth(request, 15);
        expect(response.status()).toBe(200);
        const json = await response.json();
        expect(json.status).toBe("OK");
    });
});
