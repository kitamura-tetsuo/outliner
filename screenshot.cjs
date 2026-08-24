const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000); // Wait for rendering
  await page.screenshot({ path: 'demo_screenshot.png' });

  // also grab some text content
  const text = await page.evaluate(() => document.body.innerText);
  console.log("PAGE TEXT:\n", text);

  await browser.close();
})();
