const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo');
  await page.waitForTimeout(2000);

  console.log("=== Top Right Toolbar Buttons ===");
  const topButtons = await page.$$eval('header button', buttons =>
    buttons.map(b => b.title || b.getAttribute('aria-label') || b.innerText.trim()).filter(t => t)
  );
  console.log(topButtons);

  console.log("\n=== Lower Toolbar Buttons ===");
  const lowerButtons = await page.$$eval('footer button', buttons =>
    buttons.map(b => b.title || b.getAttribute('aria-label') || b.innerText.trim()).filter(t => t)
  );
  console.log(lowerButtons);

  await browser.close();
})();
