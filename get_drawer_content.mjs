import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo', { waitUntil: 'networkidle' });

  await page.click('button:has-text("Databases")');
  await page.waitForTimeout(1000);

  const h2s = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('h1, h2, h3')).map(el => el.innerText);
  });
  console.log("Headers on page after clicking Databases:");
  console.log(h2s);

  const lists = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('ul, ol, div.flex.flex-col > a')).map(el => el.innerText || el.textContent);
  });
  console.log("Lists or links:");
  console.log(lists.slice(0, 10)); // just first 10

  await browser.close();
})();
