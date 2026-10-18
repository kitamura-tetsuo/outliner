const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo/-/pages');
  await page.waitForLoadState('networkidle');

  // Wait a bit just in case
  await page.waitForTimeout(2000);

  // Get text content of the demo page to see what's actually there
  const content = await page.evaluate(() => {
     return document.body.innerText;
  });

  fs.writeFileSync('demo_pages.txt', content);

  await browser.close();
})();
