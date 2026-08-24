const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo/Tasks%20and%20Habits', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  await page.click('button:has-text("Add Database")');
  await page.waitForTimeout(2000);

  const text = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('dialog, [role="dialog"], .modal')).map(el => {
      // return only visible ones
      const style = window.getComputedStyle(el);
      if (style.display !== 'none' && style.visibility !== 'hidden' && el.open !== false) {
        return el.innerText;
      }
      return null;
    }).filter(x => x).join('\n---\n');
  });
  console.log("Visible dialogs text:", text);

  await browser.close();
})();
