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
    const dialogs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('dialog[open], [role="menu"], .dropdown')).map(d => d.innerText);
    });
    console.log(dialogs);
  }
  await browser.close();
})();
