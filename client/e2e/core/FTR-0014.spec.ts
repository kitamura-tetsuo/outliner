/** @feature FTR-0014
 *  Title   : Configurable host and port via environment variables
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-0014: Host and port configuration", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("app uses VITE_PORT and PORT environment variables", async ({ page, baseURL }) => {
        const vitePort = process.env.VITE_PORT ?? "7090";
        const port = process.env.PORT ?? "7090";

        await expect(baseURL).toContain(port);
        await page.goto("/");
        await expect(page).toHaveURL(new RegExp(`${vitePort}`));
    });
});
