const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo');
  await page.waitForTimeout(2000);

  // Dump all buttons on the page
  const buttons = await page.$$eval('button', buttons =>
    buttons.map(b => ({
      text: b.innerText.trim(),
      title: b.title,
      aria: b.getAttribute('aria-label')
    }))
  );
  console.log("All buttons on page:", JSON.stringify(buttons, null, 2));

  await browser.close();
})();
