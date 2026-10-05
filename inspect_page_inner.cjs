const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo/Welcome');
  await page.waitForTimeout(3000);

  // Dump all buttons on the page
  const buttons = await page.$$eval('button', buttons =>
    buttons.map(b => ({
      text: b.innerText.trim(),
      title: b.title,
      aria: b.getAttribute('aria-label'),
      class: b.className
    }))
  );
  fs.writeFileSync('page_buttons.json', JSON.stringify(buttons, null, 2));

  await browser.close();
})();
