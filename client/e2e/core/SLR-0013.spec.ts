/** @feature SLR-0013
 * Title   : Multi-item drag and drop
 * Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

// This test simulates drag & drop by cutting selected text and pasting it to another item.

test.describe("SLR-0013: drag and drop multi-item text", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await TestHelpers.prepareTestEnvironment(page, testInfo);
    const item = page.locator(".outliner-item").first();
    await item.locator(".item-content").click({ force: true });
    await page.waitForSelector("textarea.global-textarea:focus");
    await page.keyboard.type("First item text");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Second item text");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Third item text");
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Home");
  });

  test("drag selection to another item", async ({ page }) => {
    await page.keyboard.down("Shift");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.up("Shift");
    await page.waitForTimeout(300);

    await page.keyboard.press("Control+x");
    const third = page.locator(".outliner-item").nth(2).locator(".item-content");
    await third.click({ force: true });
    await page.keyboard.press("End");
    await page.keyboard.press("Control+v");
    await page.waitForTimeout(500);

    const thirdText = await page.locator(".outliner-item").nth(2).locator(".item-text").textContent();
    expect(thirdText).toContain("First item text");
  });
});
