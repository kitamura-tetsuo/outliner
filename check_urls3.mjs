import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('https://outliner-d57b0.web.app/demo/-/schedules', { waitUntil: 'networkidle' });
  let url = page.url();
  let found = (await page.evaluate(() => document.body.innerText)).includes('Page not found');
  console.log(`URL: ${url} -> Not Found: ${found}`);

  await page.goto('https://outliner-d57b0.web.app/demo/schedules', { waitUntil: 'networkidle' });
  url = page.url();
  found = (await page.evaluate(() => document.body.innerText)).includes('Page not found');
  console.log(`URL: ${url} -> Not Found: ${found}`);

  await page.goto('https://outliner-d57b0.web.app/demo/-/tables', { waitUntil: 'networkidle' });
  url = page.url();
  found = (await page.evaluate(() => document.body.innerText)).includes('Page not found');
  console.log(`URL: ${url} -> Not Found: ${found}`);

  await page.goto('https://outliner-d57b0.web.app/demo/tables/1', { waitUntil: 'networkidle' });
  url = page.url();
  found = (await page.evaluate(() => document.body.innerText)).includes('Page not found');
  console.log(`URL: ${url} -> Not Found: ${found}`);

  await browser.close();
})();
