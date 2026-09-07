import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('https://outliner-d57b0.web.app/demo/demo/-/schedules', { waitUntil: 'networkidle' });
  console.log("/-/schedules Title:", await page.title());

  await page.goto('https://outliner-d57b0.web.app/demo/demo/-/tables', { waitUntil: 'networkidle' });
  console.log("/-/tables Title:", await page.title());

  await page.goto('https://outliner-d57b0.web.app/demo/demo/-/grids', { waitUntil: 'networkidle' });
  console.log("/-/grids Title:", await page.title());

  await browser.close();
})();
