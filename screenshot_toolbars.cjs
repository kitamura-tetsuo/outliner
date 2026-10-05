const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo/Welcome');
  await page.waitForTimeout(3000);

  await page.screenshot({ path: 'full_page.png', fullPage: true });

  const header = await page.$('header');
  if (header) {
    await header.screenshot({ path: 'header.png' });
  }

  await browser.close();
})();
