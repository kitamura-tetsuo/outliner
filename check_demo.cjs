const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  page.on('console', msg => console.log(`CONSOLE [${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => console.error(`PAGE_ERROR: ${err.message}`));
  page.on('requestfailed', request => console.error(`REQUEST_FAILED: ${request.url()} ${request.failure().errorText}`));

  console.log("Navigating to demo...");
  await page.goto('https://outliner-d57b0.web.app/demo', { waitUntil: 'networkidle' });
  console.log("Navigation complete.");

  await page.waitForTimeout(2000);

  await browser.close();
})();
