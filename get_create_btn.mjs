import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo', { waitUntil: 'networkidle' });

  const text = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('*')).find(el => el.textContent === 'Create' && el.children.length === 0)?.outerHTML || 'Not found';
  });

  console.log("Element with exact text 'Create':");
  console.log(text);

  // also check input near "test-page-xyz" from earlier output
  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input')).map(i => ({ type: i.type, id: i.id, placeholder: i.placeholder }));
  });
  console.log("Inputs:", inputs);

  await browser.close();
})();
