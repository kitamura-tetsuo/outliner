/** @feature FMT-0008
 *  Title   : Support multiple internal links in one item
 *  Source  : docs/client-features.yaml
 */
import { test, expect } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import { LinkTestHelpers } from "../utils/linkTestHelpers";

/**
 * @file FMT-0008.spec.ts
 * @playwright
 */

test.describe("FMT-0008: multiple internal links", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await TestHelpers.prepareTestEnvironment(page, testInfo);
  });

  test("multiple internal links are displayed", async ({ page }) => {
    // select first item
    const firstId = await TestHelpers.getItemIdByIndex(page, 0);
    expect(firstId).not.toBeNull();
    await TestHelpers.clickItemToEdit(
      page,
      `.outliner-item[data-item-id="${firstId}"] .item-content`,
    );

    // type text with multiple internal links
    await page.keyboard.type("This is [test-page] and [/project/other-page]");

    // add second item to apply formatting
    await page.keyboard.press("Enter");
    await page.keyboard.type("second item");

    // wait for formatting
    await page.waitForTimeout(500);

    // verify both links are present
    const itemLocator = page.locator(
      `.outliner-item[data-item-id="${firstId}"] .item-text`,
    );

    const html = await itemLocator.innerHTML();
    expect(html).toMatch(
      /<a href="\/test-page"[^>]*class="[^"]*internal-link[^"]*"[^>]*>test-page<\/a>/,
    );
    expect(html).toMatch(
      /<a href="\/project\/other-page"[^>]*class="[^"]*internal-link[^"]*project-link[^"]*"[^>]*>project\/other-page<\/a>/,
    );

    const firstLink = itemLocator.locator('a[href="/test-page"]');
    const secondLink = itemLocator.locator('a[href="/project/other-page"]');
    await expect(firstLink).toHaveClass(/page-not-exists/);
    await expect(secondLink).toHaveClass(/page-not-exists/);

    await LinkTestHelpers.forceLinkPreview(page, "test-page", undefined, false);
    const preview = page.locator(".link-preview-popup");
    if ((await preview.count()) > 0) {
      await expect(preview).toBeVisible();
      await expect(preview.locator("h3")).toHaveText(/test-page/i);
    }
  });
});
