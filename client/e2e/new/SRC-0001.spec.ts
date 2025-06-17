/** @feature SRC-0001
 * Basic Search Panel
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SRC-0001: search panel opens and counts results", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await TestHelpers.prepareTestEnvironment(page, testInfo, [
      "apple pie",
      "banana pie",
    ]);
  });

  test("open search panel and count results", async ({ page }) => {
    await page.keyboard.press("Control+f");
    await expect(page.locator("[data-testid=search-panel]")).toBeVisible();
    await page.locator(".search-input").fill("apple");
    await page.keyboard.press("Enter");
    const count = await page.evaluate(() => (window as any).searchResultsCount);
    expect(count).toBe(1);
  });
});
