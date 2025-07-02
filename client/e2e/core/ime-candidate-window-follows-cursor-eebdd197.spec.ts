/** @feature IME-0002
 *  Title   : IME candidate window follows active cursor
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("IME-0002: IME candidate window follows active cursor", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await TestHelpers.prepareTestEnvironment(page, testInfo);
  });

  test("hidden textarea is positioned at cursor", async ({ page }) => {
    const item = page.locator(".outliner-item.page-title");
    if ((await item.count()) === 0) {
      const visibleItems = page
        .locator(".outliner-item")
        .filter({ hasText: /.*/ });
      await visibleItems
        .first()
        .locator(".item-content")
        .click({ force: true });
    } else {
      await item.locator(".item-content").click({ force: true });
    }

    const textarea = page.locator("textarea.global-textarea");
    await textarea.waitFor({ state: "visible" });
    await textarea.focus();
    await TestHelpers.waitForCursorVisible(page);

    const positions = await page.evaluate(() => {
      const cursor = document.querySelector(
        ".editor-overlay .cursor.active",
      ) as HTMLElement | null;
      const ta = document.querySelector(
        "textarea.global-textarea",
      ) as HTMLElement | null;
      if (!cursor || !ta) return null;
      const cursorRect = cursor.getBoundingClientRect();
      const taRect = ta.getBoundingClientRect();
      return {
        cursorLeft: cursorRect.left,
        cursorTop: cursorRect.top,
        taLeft: taRect.left,
        taTop: taRect.top,
      };
    });

    expect(positions).not.toBeNull();
    const { cursorLeft, cursorTop, taLeft, taTop } = positions!;
    expect(Math.abs(cursorLeft - taLeft)).toBeLessThanOrEqual(2);
    expect(Math.abs(cursorTop - taTop)).toBeLessThanOrEqual(2);
  });
});
