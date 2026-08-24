const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Click Add Database
  await page.click('button:has-text("Add Database")');
  await page.waitForTimeout(1000);

  // check if it's a dialog/modal
  const html = await page.content();
  const fs = require('fs');
  fs.writeFileSync('add_db.html', html);

  await browser.close();
})();
