const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo/Tasks%20and%20Habits', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000); // Wait for rendering

  // Click Add Database
  await page.click('text=Add Database');
  await page.waitForTimeout(2000);

  // scroll down
  await page.evaluate(() => window.scrollBy(0, 1000));
  await page.waitForTimeout(1000);

  await page.screenshot({ path: 'tasks_add_db_down.png' });

  await browser.close();
})();
