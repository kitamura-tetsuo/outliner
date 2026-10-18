const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo/Database tables');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  const content = await page.evaluate(() => {
     return document.body.innerText;
  });

  fs.writeFileSync('demo_editor2.txt', content);

  await browser.close();
})();
