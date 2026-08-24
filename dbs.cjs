const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000); // Wait for rendering

  // Click Databases
  await page.click('text=Databases');
  await page.waitForTimeout(2000);

  await page.screenshot({ path: 'databases.png' });
  await browser.close();
})();
