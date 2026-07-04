const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const consoleMessages = [];
  page.on('console', msg => {
      consoleMessages.push(msg.text());
  });

  await page.goto('http://localhost:7090/demo/NonExistentPage123');

  await page.waitForTimeout(5000);

  console.log("Messages related to loadDemoPage:", consoleMessages.filter(msg => msg.includes('loadDemoPage') || msg.includes('sync wait') || msg.includes('not found')));

  await browser.close();
})();
