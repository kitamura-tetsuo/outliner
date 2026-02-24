import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature API-0001
 *  Title   : Firebase Functions APIサーバーの修正
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";

test.describe("API-0001: Firebase Functions CORS and token validation", () => {
    // API tests don't need page preparation

    test("OPTIONS preflight returns 204", async ({ request }) => {
        const response = await request.fetch("http://127.0.0.1:57000/api/save-container", {
            method: "OPTIONS",
        });
        expect(response.status()).toBe(204);
    });

    test("save-container with invalid token returns error", async ({ request }) => {
        const response = await request.post("http://127.0.0.1:57000/api/save-container", {
            data: { idToken: "invalid", containerId: "test" },
        });
        expect(response.status()).toBe(500);
        const body = await response.json();
        expect(body.error).toBe("Failed to save container ID");
    });
});
