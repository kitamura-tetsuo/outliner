import { test, expect } from '@playwright/test';

test('take screenshot', async ({ page }) => {
  await page.goto('https://outliner-d57b0.web.app/demo');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'demo_screenshot.png' });
});
