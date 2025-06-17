/** @feature FTR-0014 */
import { expect, test } from "@playwright/test";

/**
 * FTR-0014: Verify custom PORT and VITE_PORT environment variables
 */

test.describe("FTR-0014: custom environment ports", () => {
    test("uses provided PORT and VITE_PORT for server", async ({ page, baseURL }) => {
        const port = process.env.PORT ?? "7090";
        const vitePort = process.env.VITE_PORT ?? port;

        await expect(baseURL).toContain(port);
        await page.goto("/");
        await expect(page).toHaveURL(new RegExp(`${vitePort}`));
        await expect(page.locator("h1")).toContainText("Fluid Outliner App");
    });
});
