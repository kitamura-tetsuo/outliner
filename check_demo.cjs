const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];

  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      errors.push(`[${msg.type()}] ${msg.text()}`);
    }
  });

  page.on('pageerror', error => {
    errors.push(`[pageerror] ${error.message}`);
  });

  page.on('requestfailed', request => {
    errors.push(`[requestfailed] ${request.url()} - ${request.failure().errorText}`);
  });

  console.log("Navigating to https://outliner-d57b0.web.app/demo ...");
  await page.goto('https://outliner-d57b0.web.app/demo', { waitUntil: 'networkidle' });

  // Wait a bit to see if any delayed errors happen
  await page.waitForTimeout(3000);

  console.log("Errors collected:", errors);
  await browser.close();
})();
