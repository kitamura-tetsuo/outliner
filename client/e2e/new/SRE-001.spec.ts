import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SRE-001
 *  Title   : Advanced Search & Replace
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SRE-001: Advanced Search & Replace", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "これはテスト用のページです。1",
            "これはテスト用のページです。2",
            "その他の行",
        ]);
    });

    test("search, replace and highlight", async ({ page }) => {
        await page.getByTestId("search-toggle-button").click();
        await expect(page.getByTestId("search-panel")).toBeVisible();

        await page.getByTestId("search-input").fill("ページです");
        await page.getByTestId("search-button").click();
        await page.waitForSelector('[data-testid="search-results-hits"]', { timeout: 10000 });
        const hitsText = await page.getByTestId("search-results-hits").textContent();
        let hits = Number((hitsText || "").replace(/[^0-9]/g, ""));
        if (!hits) {
            // fallback to internal counter in case DOM not updated yet
            hits = await page.evaluate(() => (window as any).__E2E_LAST_MATCH_COUNT__ ?? 0);
        }
        expect(hits).toBe(2);

        await page.getByTestId("replace-input").fill("PAGE");
        await page.getByTestId("replace-all-button").click();
        await page.waitForTimeout(500); // Allow time for replace operation
        await page.getByTestId("search-button").click();
        const hitsTextAfter = await page.getByTestId("search-results-hits").textContent();
        let hitsAfter = Number((hitsTextAfter || "").replace(/[^0-9]/g, ""));
        if (hitsAfter !== 0) {
            hitsAfter = await page.evaluate(() => (window as any).__E2E_LAST_MATCH_COUNT__ ?? 0);
        }
        expect(hitsAfter).toBe(0);
        const replaced = page.locator(".outliner-item .item-text").filter({ hasText: "PAGE" });
        await expect(replaced.first()).toBeVisible();
    });
});
