const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('http://localhost:7090/demo/NonExistentPage123');

  // Wait for load
  await page.waitForTimeout(5000);

  // We verified isLoading gets set to true. We want to know if finally block is executed and sets it to false.
  // wait... what if it throws an error while rendering?
  const errors = [];
  page.on('pageerror', err => errors.push(err));

  await page.waitForTimeout(1000);
  console.log("Page errors:", errors);

  await browser.close();
})();
