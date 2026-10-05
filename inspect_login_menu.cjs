const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo');
  await page.waitForTimeout(2000);

  const loginBtn = await page.$('.login-status-indicator');
  if (loginBtn) {
    await loginBtn.click();
    await page.waitForTimeout(1000);

    // Look for a popup or dropdown menu that appeared
    const popupText = await page.evaluate(() => {
      // Find elements that look like menus or dialogs
      const menus = document.querySelectorAll('dialog, [role="menu"], [role="dialog"], .dropdown, .menu');
      if (menus.length === 0) return 'No popup menu found';

      let text = '';
      for (const menu of menus) {
        // filter out hidden ones if possible
        if (menu.offsetParent !== null) {
           text += menu.innerText + '\n';
        }
      }
      return text;
    });
    console.log(popupText);
  } else {
    console.log("No login button found");
  }

  await browser.close();
})();
