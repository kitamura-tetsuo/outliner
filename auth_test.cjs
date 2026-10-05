const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo');
  await page.waitForLoadState('networkidle');

  await page.click('text=Not signed in');
  await page.waitForTimeout(1000);

  await page.screenshot({ path: 'demo_auth_menu.png', fullPage: true });

  const html = await page.content();
  fs.writeFileSync('demo_auth_menu.html', html);

  await browser.close();
})();
