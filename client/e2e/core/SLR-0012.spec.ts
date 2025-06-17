/** @feature SLR-0012
 * Title   : Multi-item copy and paste
 * Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import { CursorValidator } from "../utils/cursorValidation";

test.describe("SLR-0012: multi-item copy & paste", () => {
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

  test("copy selected text across items and paste", async ({ page }) => {
    await page.keyboard.down("Shift");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.up("Shift");
    await page.waitForTimeout(300);

    await page.keyboard.press("Control+c");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Control+v");
    await page.waitForTimeout(500);

    const count = await page.locator(".outliner-item").count();
    expect(count).toBeGreaterThanOrEqual(4);

    const lastText = await page.locator(".outliner-item").nth(count - 1).locator(".item-text").textContent();
    expect(lastText).toContain("First item text");
  });
});
