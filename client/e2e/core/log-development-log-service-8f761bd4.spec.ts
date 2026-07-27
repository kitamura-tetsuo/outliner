import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature LOG-0001
 *  Title   : Development log service
 *  Source  : docs/client-features/log-development-log-service-8f761bd4.yaml
 */
import { expect, test } from "@playwright/test";

test.describe("LOG-0001: log service health", () => {
    test("/health endpoint returns OK", async ({ request }) => {
        const response = await request.get("http://127.0.0.1:57000/health");
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.status).toBe("OK");
        expect(typeof body.timestamp).toBe("string");
    });

    test("POST to /health returns 405 Method Not Allowed", async ({ request }) => {
        const res = await request.post("http://127.0.0.1:57000/health");
        expect(res.status()).toBe(405);
    });
});
