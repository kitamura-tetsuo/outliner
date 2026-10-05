const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo');
  await page.waitForTimeout(2000);

  const headerHtml = await page.innerHTML('header');
  fs.writeFileSync('header.html', headerHtml);

  // also get footer
  const footerExists = await page.$('footer') !== null;
  if(footerExists) {
    const footerHtml = await page.innerHTML('footer');
    fs.writeFileSync('footer.html', footerHtml);
  } else {
    fs.writeFileSync('footer.html', 'No footer element found');
  }

  // and get main toolbars (often floating or fixed)
  const navHtml = await page.innerHTML('nav');
  fs.writeFileSync('nav.html', navHtml);

  await browser.close();
})();
