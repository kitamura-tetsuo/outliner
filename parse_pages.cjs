const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('https://outliner-d57b0.web.app/demo/Remote%20MCP%20Access', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const mcpText = await page.evaluate(() => document.body.innerText);
  console.log("--- Remote MCP Access ---");
  console.log(mcpText.substring(0, 1000));

  await page.goto('https://outliner-d57b0.web.app/demo/Schedule%20Rules', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const schedText = await page.evaluate(() => document.body.innerText);
  console.log("--- Schedule Rules ---");
  console.log(schedText.substring(0, 1000));

  await page.goto('https://outliner-d57b0.web.app/demo/Advanced%20Features', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const advText = await page.evaluate(() => document.body.innerText);
  console.log("--- Advanced Features ---");
  // using head conceptually by slicing string
  console.log(advText.substring(0, 2000));

  await browser.close();
})();
