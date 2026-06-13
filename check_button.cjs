const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('https://outliner-d57b0.web.app/demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const resetBtnText = await page.textContent('button[data-testid="demo-reset-button"]');
  console.log(`Button text is: "${resetBtnText?.trim()}"`);

  await page.click('button[data-testid="demo-reset-button"]');
  console.log('Clicked reset button');

  await page.waitForTimeout(2000);

  const doneText = await page.textContent('p[data-testid="demo-reset-done"]');
  console.log(`Done text is: "${doneText?.trim()}"`);

  await browser.close();
})();
