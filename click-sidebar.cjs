const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);

  // Click 'Show sidebar'
  await page.click('[aria-label="Show sidebar"]');
  await page.waitForTimeout(2000);

  const sidebarLinks = await page.evaluate(() => {
    const nav = document.querySelector('nav');
    if (!nav) return 'No nav found';
    return Array.from(nav.querySelectorAll('a, button')).map(el => el.innerText || el.ariaLabel || el.textContent);
  });

  fs.writeFileSync('sidebar-links.json', JSON.stringify(sidebarLinks, null, 2));
  await browser.close();
})();
