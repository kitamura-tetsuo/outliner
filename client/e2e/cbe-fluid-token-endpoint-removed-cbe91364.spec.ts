/** @feature FTR-cbe91364
 *  Title   : Remove Fluid token endpoint
 *  Source  : docs/client-features/cbe-remove-fluid-token-endpoint-cbe91364.yaml
 */
import { expect, test } from "@playwright/test";

test.describe("FTR-cbe91364: fluid token endpoint removed", () => {
    test("returns 404", async ({ request }) => {
        const response = await request.get("http://localhost:57000/api/fluidToken");
        expect(response.status()).toBe(404);
    });
});
import "./utils/registerAfterEachSnapshot";
import "./utils/registerAfterEachSnapshot";
