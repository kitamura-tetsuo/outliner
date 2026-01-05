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
        const regexCheckbox = page.locator('label:has-text("正規表現") input');
        await regexCheckbox.check();
        await expect(regexCheckbox).toBeChecked();

        await page.getByTestId("search-input").fill("regex line \\d");

        // Ensure regex mode is effectively active (UI sync)
        await page.waitForTimeout(500);

        await page.getByTestId("search-button").click();

        // Wait for hits to update with retries
        await expect.poll(async () => {
            const text = await page.getByTestId("search-results-hits").textContent();
            if (!text) return 0;
            // Extract number from "2 hits" or similar
            const val = Number((text || "").replace(/[^0-9]/g, ""));
            return val;
        }, { timeout: 20000, intervals: [500, 1000, 2000] }).toBe(2);
    });
});
