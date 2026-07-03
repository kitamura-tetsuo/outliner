const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      errors.push(`${msg.type().toUpperCase()}: ${msg.text()}`);
    } else {
        console.log(`[PAGE LOG] ${msg.text()}`);
    }
  });

  page.on('pageerror', error => {
    errors.push(`PAGEERROR: ${error.message}`);
  });

  await page.goto('http://localhost:7090/demo/Getting%20Started');
  await page.waitForTimeout(5000); // 5 seconds

  console.log('--- Errors ---');
  console.log(errors.join('\n'));
  await browser.close();
})();
