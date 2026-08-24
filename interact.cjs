const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000); // Wait for rendering

  // Click Add Database
  await page.click('text=Add Database');
  await page.waitForTimeout(2000);

  await page.screenshot({ path: 'interact1.png' });

  const text = await page.evaluate(() => document.body.innerText);
  console.log("PAGE TEXT AFTER CLICK:\n", text);

  await browser.close();
})();
