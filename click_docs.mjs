import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo', { waitUntil: 'networkidle' });

  await page.click('.sidebar-toggle');
  await page.waitForTimeout(500);

  const h2s = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a')).map(el => {
       return { text: el.innerText, href: el.href };
    }).filter(a => a.text.includes('Docs') || a.text.includes('Settings'));
  });
  console.log("Settings and Docs links:");
  console.log(h2s);

  await browser.close();
})();
