import { test, expect } from '@playwright/test';

test('verify demo page click', async ({ page }) => {
    await page.goto('http://127.0.0.1:7090/demo');
    await page.waitForTimeout(2000);

    // Evaluate in browser to click
    await page.evaluate(() => {
        const link = document.querySelector('a[href="/demo/Advanced%20Features"]');
        if (link) (link as HTMLElement).click();
    });

    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'demo3.png' });
});
