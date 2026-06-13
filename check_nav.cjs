const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('https://outliner-d57b0.web.app/demo/Formatting', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  console.log('Clicking reset button...');
  await page.click('button[data-testid="demo-reset-button"]');
  await page.waitForTimeout(2000);

  const doneText = await page.textContent('p[data-testid="demo-reset-done"]');
  console.log(`Done text is: "${doneText?.trim()}"`);

  await browser.close();
})();
