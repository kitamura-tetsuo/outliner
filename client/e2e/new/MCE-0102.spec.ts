import { test, expect } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import { CursorValidator } from "../utils/cursorValidation";

/** @feature MCE-0102 */

test.describe("MCE-0102: VS Code style multi-cursor commands", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await TestHelpers.prepareTestEnvironment(page, testInfo);
  });

  test("Ctrl+Shift+Alt+ArrowDown adds a cursor below", async ({ page }) => {
    const firstItem = page.locator(".outliner-item").first();
    await firstItem.click({ force: true });
    await TestHelpers.waitForCursorVisible(page);
    await page.keyboard.press("Control+Shift+Alt+ArrowDown");
    await page.waitForTimeout(500);
    const data = await CursorValidator.getCursorData(page);
    expect(data.cursorCount).toBeGreaterThan(1);
  });
});
