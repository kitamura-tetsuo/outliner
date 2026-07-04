const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('http://localhost:7090/demo/NonExistentPage123');

  // Wait for load
  await page.waitForTimeout(5000);

  // It's possible that `loadDemoPage` is being called repeatedly!
  // Let's hook into the console and see if it's logging repeatedly.
  const consoleMessages = [];
  page.on('console', msg => consoleMessages.push(msg.text()));

  await page.waitForTimeout(2000);

  console.log("Messages:");
  consoleMessages.forEach(msg => console.log(msg));

  await browser.close();
})();
