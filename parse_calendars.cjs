const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo/Calendars', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const text = await page.evaluate(() => document.body.innerText);
  const fs = require('fs');
  fs.writeFileSync('calendars.txt', text);

  await browser.close();
})();
