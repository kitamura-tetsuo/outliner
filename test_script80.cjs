const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('http://localhost:7090/Untitled%20Project/NonExistentPage123');

  await page.waitForTimeout(5000);

  const text = await page.evaluate(() => document.body.innerHTML);
  console.log("Includes Loading Page:", text.includes('Loading Page...'));
  console.log("Includes Page not found:", text.includes('Page not found'));

  await browser.close();
})();
