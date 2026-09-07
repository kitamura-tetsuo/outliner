import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo', { waitUntil: 'networkidle' });

  await page.click('.sidebar-toggle');
  await page.waitForTimeout(500);

  await page.click('button[title="Add new scheduled SQL"]');
  await page.waitForTimeout(1000);

  const content = await page.evaluate(() => document.body.innerText);
  console.log("Body text after clicking Add new scheduled SQL:");
  console.log(content.substring(0, 1000));

  await browser.close();
})();
