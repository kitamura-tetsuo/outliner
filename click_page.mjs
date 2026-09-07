import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo/demo/test-page-xyz', { waitUntil: 'networkidle' });

  const content = await page.evaluate(() => document.body.innerText);
  console.log("Body text of test-page-xyz:");
  console.log(content.substring(0, 1000));

  const toolbars = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, a, [role="button"]')).map(el => ({
      text: el.innerText.trim(),
      title: el.title,
      ariaLabel: el.getAttribute('aria-label')
    })).filter(b => b.title?.includes('History') || b.ariaLabel?.includes('History') || b.text.includes('History'));
  });
  console.log("History buttons:");
  console.log(toolbars);

  await browser.close();
})();
