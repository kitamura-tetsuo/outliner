/** @feature SRC-0002
 * Replace All via Search Panel
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SRC-0002: replace all", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await TestHelpers.prepareTestEnvironment(page, testInfo, [
      "foo bar",
      "baz foo",
    ]);
  });

  test("replace all occurrences", async ({ page }) => {
    await page.keyboard.press("Control+f");
    await page.locator(".search-input").fill("foo");
    await page.locator(".replace-input").fill("qux");
    await page.locator(".replace-all-btn").click();
    const texts = await page.evaluate(() => {
      return Array.from(
        document.querySelectorAll(".outliner-item .item-text"),
      ).map((el) => el.textContent);
    });
    expect(texts.some((t) => t?.includes("qux"))).toBe(true);
  });
});
