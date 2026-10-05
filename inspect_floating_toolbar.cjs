const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo/Welcome');
  await page.waitForTimeout(2000);

  // click on a text element to focus and select text
  await page.evaluate(() => {
    const el = document.querySelector('.item-content, .text-content, p, li');
    if(el) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  });

  await page.waitForTimeout(1000);

  const floatingHtml = await page.evaluate(() => {
    // try to find floating toolbar
    const toolbar = document.querySelector('.floating-toolbar, .selection-toolbar, [role="toolbar"]');
    return toolbar ? toolbar.outerHTML : 'No floating toolbar found';
  });
  console.log(floatingHtml);

  await browser.close();
})();
