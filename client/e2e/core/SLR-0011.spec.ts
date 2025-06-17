/** @feature SLR-0011
 * Title   : Mouse drag multi-item selection
 * Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

// This test drags from the first item to the second item and verifies the selection spans both items.

test.describe("SLR-0011: multi-item selection via mouse drag", () => {
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

  test("drag across items creates multi-item selection", async ({ page }) => {
    const first = page.locator(".outliner-item").nth(0).locator(".item-text");
    const second = page.locator(".outliner-item").nth(1).locator(".item-text");
    const box1 = await first.boundingBox();
    const box2 = await second.boundingBox();
    if (!box1 || !box2) test.skip();
    await page.mouse.move(box1.x + 5, box1.y + 5);
    await page.mouse.down();
    await page.mouse.move(box2.x + box2.width - 2, box2.y + 5);
    await page.mouse.up();
    await page.waitForTimeout(300);
    const data = await page.evaluate(() => {
      const store = (window as any).editorOverlayStore;
      const sel = store ? Object.values(store.selections)[0] : null;
      return sel ? { start: sel.startItemId, end: sel.endItemId } : null;
    });
    expect(data).not.toBeNull();
    expect(data.start).not.toBe(data.end);
  });
});
