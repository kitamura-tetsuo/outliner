import { test, expect } from '@playwright/test';

test('verify demo', async ({ page }) => {
    await page.goto('http://127.0.0.1:7090/demo');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'demo1.png' });

    // click reset button
    await page.click('[data-testid="demo-reset-button"]');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'demo2.png' });
});
