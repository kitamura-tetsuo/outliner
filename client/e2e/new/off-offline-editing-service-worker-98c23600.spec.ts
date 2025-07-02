/** @feature OFF-0001
 *  Title   : Offline editing via service worker
 *  Source  : docs/client-features/off-offline-editing-service-worker-98c23600.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("OFF-0001: Offline editing", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await TestHelpers.prepareTestEnvironment(page, testInfo);
  });

  test("queue edits while offline", async ({ page }) => {
    await TestHelpers.waitForOutlinerItems(page);
    const firstId = await TestHelpers.getItemIdByIndex(page, 0);
    if (!firstId) throw new Error("item id not found");

    await page.context().setOffline(true);
    await page.click(`.outliner-item[data-item-id="${firstId}"] .item-content`);
    await page.keyboard.type(" offline");
    await expect(page.locator(`.outliner-item[data-item-id="${firstId}"] .item-content`)).toContainText("offline");

    await page.context().setOffline(false);
    await page.waitForTimeout(1000);
  });
});
