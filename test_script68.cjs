const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const consoleMessages = [];
  page.on('console', msg => {
      consoleMessages.push(msg.text());
  });

  await page.goto('http://localhost:7090/demo/NonExistentPage123');

  await page.waitForTimeout(6000);

  console.log("Console messages:");
  consoleMessages.filter(msg => msg.includes('loadDemoPage') || msg.includes('Demo page') || msg.includes('Page instance')).forEach(msg => console.log(msg));

  await browser.close();
})();
