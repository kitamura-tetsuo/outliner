const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  await page.click('button:has-text("Databases")');
  await page.waitForTimeout(2000);

  // extract text from drawer
  const text = await page.evaluate(() => {
    // try to find the drawer/sidebar on the right
    const possibleDrawers = Array.from(document.querySelectorAll('body > div'));
    return possibleDrawers[possibleDrawers.length-1].innerText;
  });
  console.log("Drawer text:", text);
  await page.screenshot({ path: 'databases_drawer.png' });

  await browser.close();
})();
