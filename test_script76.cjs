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

  console.log("Console messages:", consoleMessages.filter(msg => msg.includes('react to')));

  const text = await page.evaluate(() => {
     return [
       document.body.innerHTML.includes('Loading Demo...'),
       document.body.innerHTML.includes('Page not found'),
       !!document.querySelector('.loader')
     ];
  });
  console.log("State:", text);

  await browser.close();
})();
