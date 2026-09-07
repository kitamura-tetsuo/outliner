import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo', { waitUntil: 'networkidle' });

  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input, textarea')).map(input => {
      return {
        type: input.type,
        placeholder: input.placeholder,
        value: input.value,
        ariaLabel: input.getAttribute('aria-label'),
        classes: input.className
      };
    });
  });

  console.log("Inputs on page:");
  console.log(JSON.stringify(inputs, null, 2));

  await browser.close();
})();
