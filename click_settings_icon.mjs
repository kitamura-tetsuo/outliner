import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo/Publishing%20and%20Sharing', { waitUntil: 'networkidle' });

  const text = await page.evaluate(() => document.body.innerText);
  console.log("Publishing and Sharing Page text:");
  console.log(text.substring(0, 500));

  const topBarButtons = await page.evaluate(() => {
    const topBar = document.querySelector('header, nav');
    if (!topBar) return [];
    return Array.from(topBar.querySelectorAll('button, a')).map(el => ({ text: el.innerText, title: el.title, href: el.href, 'aria-label': el.getAttribute('aria-label') }));
  });
  console.log("Top bar buttons/links:");
  console.log(topBarButtons);

  await browser.close();
})();
