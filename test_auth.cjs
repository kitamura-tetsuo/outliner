const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo/Welcome');
  await page.waitForTimeout(2000);

  // click "Not signed in"
  const loginStatus = await page.$('.login-status-indicator');
  if (loginStatus) {
    await loginStatus.click();
    await page.waitForTimeout(1000);
    const html = await page.innerHTML('body');
    if (html.includes('Sign in')) {
        console.log("Auth menu opened");
    } else {
        console.log("No Sign in found in body. Searching for dialogs...");
    }
  }
  await browser.close();
})();
