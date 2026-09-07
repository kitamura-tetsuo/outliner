import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('https://outliner-d57b0.web.app/demo/-/tables', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const tableLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a')).map(a => a.href).filter(href => href.includes('tables'));
  });
  console.log("Table Links:", tableLinks);

  await page.goto('https://outliner-d57b0.web.app/demo/-/schedules', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const scheduleLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a')).map(a => a.href).filter(href => href.includes('schedules'));
  });
  console.log("Schedule Links:", scheduleLinks);

  await browser.close();
})();
