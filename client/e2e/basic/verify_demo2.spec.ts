import { test, expect } from '@playwright/test';

test('verify demo page click', async ({ page }) => {
    await page.goto('http://127.0.0.1:7090/demo');
    await page.waitForTimeout(2000);

    // Click on the first page link in the grid
    await page.click('text="Advanced Features"');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'demo3.png' });
});
