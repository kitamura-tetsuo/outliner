import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo', { waitUntil: 'networkidle' });

  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, a')).map(el => ({
      text: el.innerText.trim(),
      title: el.title,
      ariaLabel: el.getAttribute('aria-label'),
      className: el.className
    })).filter(b => b.title?.includes('Settings') || b.ariaLabel?.includes('Settings') || b.text.includes('Settings') || b.className.includes('gear'));
  });
  console.log("Settings related buttons:");
  console.log(buttons);

  await browser.close();
})();
