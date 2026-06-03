const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('https://outliner-d57b0.web.app/demo', { waitUntil: 'networkidle' });

  console.log("Navigated to demo page.");
  await page.waitForTimeout(5000);

  console.log("Errors captured:");
  console.log(errors);

  await browser.close();
})();
