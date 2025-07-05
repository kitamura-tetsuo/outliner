/** @feature API-0004
 *  Title   : Admin user list
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";

test.describe("API-0004: admin user list", () => {
    test("invalid token returns error", async ({ request }) => {
        const res = await request.post("http://localhost:57000/api/list-users", {
            data: { idToken: "invalid-token" },
        });
        expect(res.status()).toBeGreaterThanOrEqual(400);
    });

    test("missing token returns 400", async ({ request }) => {
        const res = await request.post("http://localhost:57000/api/list-users", {
            data: {},
        });
        expect(res.status()).toBe(400);
    });

    test("OPTIONS request returns 204", async ({ request }) => {
        const res = await request.fetch("http://localhost:57000/api/list-users", {
            method: "OPTIONS",
        });
        expect(res.status()).toBe(204);
    });
});
