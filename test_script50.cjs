const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('http://localhost:7090/demo/NonExistentPage123');

  await page.waitForTimeout(5000);

  const text = await page.evaluate(() => {
     return !!document.querySelector('.loader');
  });
  console.log("Loader visible:", text);

  await browser.close();
})();
