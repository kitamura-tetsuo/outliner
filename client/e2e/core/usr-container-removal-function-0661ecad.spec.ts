/** @feature USR-0661ecad
 *  Title   : Container removal function
 *  Source  : docs/client-features/usr-container-removal-function-0661ecad.yaml
 */
import { expect, test } from "@playwright/test";

test("delete-container returns 405 with invalid token", async ({ request }) => {
    const res = await request.post("http://localhost:7090/api/delete-container", {
        data: { idToken: "invalid", containerId: "dummy" },
    });
    expect(res.status()).toBe(405);
});
import "../utils/registerAfterEachSnapshot";
