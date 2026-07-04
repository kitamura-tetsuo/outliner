const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('http://localhost:7090/demo/NonExistentPage123');

  // Wait for load
  await page.waitForTimeout(5000);

  const text = await page.evaluate(() => document.body.innerHTML);
  console.log("HTML:", text.substring(0, 100)); // To make sure it loaded

  await browser.close();
})();
