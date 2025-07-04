/** @feature ATT-0001 */
import { test, expect } from '@playwright/test';
import { TestHelpers } from '../utils/testHelpers';

test.describe('ATT-0001: Drag and drop attachments', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await TestHelpers.prepareTestEnvironment(page, testInfo);
    const first = page.locator('.outliner-item').first();
    await first.locator('.item-content').click({ force: true });
    await page.keyboard.type('Drop here');
  });

  test('attachment preview appears', async ({ page }) => {
    const item = page.locator('.outliner-item').first();
    const content = item.locator('.item-content');
    const data = await page.evaluateHandle(() => new DataTransfer());
    await data.evaluate((dt) => {
      const blob = new Blob(['hello'], { type: 'text/plain' });
      const file = new File([blob], 'hello.txt', { type: 'text/plain' });
      dt.items.add(file);
    });
    await content.dispatchEvent('drop', { dataTransfer: data });
    await page.waitForTimeout(1000);
    await expect(item.locator('.attachment-preview')).toBeVisible();
  });

  test('attachment persists after reload', async ({ page }) => {
    const item = page.locator('.outliner-item').first();
    const content = item.locator('.item-content');
    const data = await page.evaluateHandle(() => new DataTransfer());
    await data.evaluate((dt) => {
      const blob = new Blob(['world'], { type: 'text/plain' });
      const file = new File([blob], 'world.txt', { type: 'text/plain' });
      dt.items.add(file);
    });
    await content.dispatchEvent('drop', { dataTransfer: data });
    await page.waitForTimeout(1000);
    await page.reload();
    await expect(item.locator('.attachment-preview')).toBeVisible();
  });
});
