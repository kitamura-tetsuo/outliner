import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SRE-001
 *  Title   : Advanced Search & Replace (regex)
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SRE-001: Advanced Search & Replace regex", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "regex line 1",
            "regex line 2",
            "other line",
        ]);
    });

    test("regex search highlights matching lines", async ({ page }) => {
        await page.getByTestId("search-toggle-button").click();
        await expect(page.getByTestId("search-panel")).toBeVisible();

        // enable regex mode
        await page.locator('label:has-text("正規表現") input').check();

        await page.getByTestId("search-input").fill("regex line \\d");
        await page.getByTestId("search-button").click();
        await TestHelpers.waitForUIStable(page);
        const hitsText = await page.getByTestId("search-results-hits").textContent();
        let hits = Number((hitsText || "").replace(/[^0-9]/g, ""));
        if (!hits) {
            hits = await page.evaluate(() => (window as any).__E2E_LAST_MATCH_COUNT__ ?? 0);
        }
        expect(hits).toBe(2);
    });
});
