import { test, expect } from '@playwright/test';
test('take screenshot of demo', async ({ page }) => {
  await page.goto('http://127.0.0.1:7090/demo');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'demo_list_screenshot.png' });
});
