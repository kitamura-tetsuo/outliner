import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('https://outliner-d57b0.web.app/demo/-/tables/Sales', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  console.log("URL for /demo/-/tables/Sales:", page.url());
  console.log("Body of /demo/-/tables/Sales:", (await page.evaluate(() => document.body.innerText)).substring(0, 500));

  await page.goto('https://outliner-d57b0.web.app/demo/tables/Sales', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  console.log("URL for /demo/tables/Sales:", page.url());
  console.log("Body of /demo/tables/Sales:", (await page.evaluate(() => document.body.innerText)).substring(0, 500));

  await browser.close();
})();
