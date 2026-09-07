import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('https://outliner-d57b0.web.app/demo/demo/-/schedules', { waitUntil: 'networkidle' });
  console.log("/-/schedules body:", (await page.evaluate(() => document.body.innerText)).substring(0, 50));

  await page.goto('https://outliner-d57b0.web.app/demo/demo/-/tables', { waitUntil: 'networkidle' });
  console.log("/-/tables body:", (await page.evaluate(() => document.body.innerText)).substring(0, 50));

  await page.goto('https://outliner-d57b0.web.app/demo/demo/tables/Sales', { waitUntil: 'networkidle' });
  console.log("/tables/Sales body:", (await page.evaluate(() => document.body.innerText)).substring(0, 50));

  await page.goto('https://outliner-d57b0.web.app/demo/demo/-/tables/Sales', { waitUntil: 'networkidle' });
  console.log("/-/tables/Sales body:", (await page.evaluate(() => document.body.innerText)).substring(0, 50));

  await browser.close();
})();
