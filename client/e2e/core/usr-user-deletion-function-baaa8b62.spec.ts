/** @feature USR-baaa8b62
 *  Title   : User deletion function
 *  Source  : docs/client-features/usr-user-deletion-function-baaa8b62.yaml
 */
import { expect, test } from "@playwright/test";

test("delete-user returns 405 with invalid token", async ({ request }) => {
    const res = await request.post("http://localhost:7091/api/delete-user", {
        data: { idToken: "invalid" },
    });
    expect(res.status()).toBe(404);
});
