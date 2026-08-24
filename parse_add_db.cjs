const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  await page.click('button:has-text("Add Database")');
  await page.waitForTimeout(1000);

  const text = await page.evaluate(() => {
    // Look for role="dialog" or floating UI elements
    const floating = Array.from(document.querySelectorAll('[role="dialog"], .floating, [role="menu"]'));
    return floating.map(f => f.innerText).join('\n---\n');
  });
  console.log("Floating UI text:", text);

  await browser.close();
})();
