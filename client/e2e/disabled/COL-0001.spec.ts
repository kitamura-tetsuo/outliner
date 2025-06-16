/** @feature COL-0001
 *  Title   : 他ユーザーのカーソル表示
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import { CursorValidator } from "../utils/cursorValidation";

test.describe("COL-0001: 他ユーザーのカーソル表示", () => {
  test("他ユーザーのカーソルを受信して表示する", async ({ page, browser }, testInfo) => {
    const { projectName, pageName } = await TestHelpers.prepareTestEnvironment(page, testInfo);
    await TestHelpers.waitForOutlinerItems(page);
    const firstItem = page.locator(".outliner-item").first();
    const itemId = await firstItem.getAttribute("data-item-id");
    await TestHelpers.clickItemToEdit(page, `.outliner-item[data-item-id="${itemId}"] .item-content`);

    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await page2.goto(`/${projectName}/${pageName}`);
    await TestHelpers.waitForOutlinerItems(page2);

    await page2.waitForFunction(() => {
      const store = (window as any).editorOverlayStore;
      return store && Object.keys(store.cursors).length > 0;
    }, { timeout: 10000 });

    const data = await CursorValidator.getCursorData(page2);
    expect(data.cursorCount).toBeGreaterThan(0);

    await context2.close();
  });
});
