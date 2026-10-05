const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo/Welcome');
  await page.waitForTimeout(2000);

  await page.click('.login-status-indicator');
  await page.waitForTimeout(1000);

  await page.screenshot({ path: 'auth_menu.png' });
  await browser.close();
})();
