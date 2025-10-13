import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-124575e6
 *  Title   : User can reset forgotten password
 *  Source  : docs/client-features/ftr-user-can-reset-forgotten-password-124575e6.yaml
 */
import { expect, test } from "@playwright/test";

test("password reset page not implemented", async ({ request }) => {
    const res = await request.get("http://localhost:7090/auth/forgot");
    expect(res.status()).toBe(200);
});
