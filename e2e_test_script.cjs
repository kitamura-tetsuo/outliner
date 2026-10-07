const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    console.log(`[${msg.type()}] ${msg.text()}`);
  });

  const errors = [];
  page.on('pageerror', err => {
    errors.push(err.message);
    console.error(`Page error: ${err.message}`);
  });

  await page.goto('https://outliner-d57b0.web.app/demo', { waitUntil: 'networkidle' });

  // Try to interact with the outline
  console.log('Page loaded');

  // Optional: wait a bit
  await page.waitForTimeout(3000);

  console.log('Console Logs:', consoleLogs);
  console.log('Errors:', errors);

  await browser.close();
})();
