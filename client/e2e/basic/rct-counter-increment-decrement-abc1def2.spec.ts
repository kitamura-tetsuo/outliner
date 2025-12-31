import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature RCT-0001
 *  Title   : Counter increments and decrements
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";

test.describe("counter", () => {
    test.beforeEach(async ({ page }) => {
        // Navigate directly to counter page (doesn't need project/page context)
        await page.goto("/counter", { waitUntil: "networkidle" });
    });

    test("increments and decrements", async ({ page }) => {
        const inc = page.getByTestId("inc");
        const dec = page.getByTestId("dec");
        const value = page.getByTestId("value");

        await expect(value).toHaveText("0");
        await inc.click();
        await expect(value).toHaveText("1");
        await dec.click();
        await expect(value).toHaveText("0");
    });
});
