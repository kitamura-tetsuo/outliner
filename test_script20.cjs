const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('http://localhost:7090/demo/NonExistentPage123');

  // Wait for load
  await page.waitForTimeout(5000);

  const result = await page.evaluate(() => {
     return document.querySelector('.loader') !== null;
  });
  console.log("Loader visible:", result);

  await browser.close();
})();
