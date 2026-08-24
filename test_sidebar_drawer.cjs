const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const html = await page.content();
  const fs = require('fs');
  fs.writeFileSync('dom.html', html);

  await browser.close();
})();
