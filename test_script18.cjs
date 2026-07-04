const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('http://localhost:7090/demo/NonExistentPage123');

  // Wait for load
  await page.waitForTimeout(5000);

  const isLoadingValue = await page.evaluate(() => {
     if (typeof window.DEBUG_isLoading === 'function') {
         return window.DEBUG_isLoading();
     }
     return null;
  });
  console.log("isLoading:", isLoadingValue);

  await browser.close();
})();
