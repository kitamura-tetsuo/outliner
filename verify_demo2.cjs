const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  let errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      errors.push(`CONSOLE [${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', error => errors.push(`PAGE ERROR: ${error.message}`));

  console.log("Navigating to demo");
  await page.goto('http://localhost:5173/demo/Advanced%20Features', { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);

  console.log("Capturing screenshot");
  await page.screenshot({ path: '/app/screenshot_advanced_features.png', fullPage: true });

  if (errors.length > 0) {
    console.log("Errors during page load:");
    console.log(errors.join("\n"));
  } else {
    console.log("No console errors/warnings found. Verification successful.");
  }

  await browser.close();
})();
