const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('http://localhost:7090/demo/NonExistentPage123');

  await page.waitForTimeout(5000);

  // Expose a function to set pageNotFound manually and see if UI updates
  await page.evaluate(() => {
     // Not possible to access component state from outside.
  });

  await browser.close();
})();
