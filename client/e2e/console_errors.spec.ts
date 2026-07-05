import { test, expect } from '@playwright/test';

test('check console errors on demo page', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', err => {
    errors.push(err.message);
  });

  await page.goto('https://outliner-d57b0.web.app/demo');
  await page.waitForTimeout(5000);

  console.log("ERRORS:", errors);
  expect(errors.length).toBe(0);
});
