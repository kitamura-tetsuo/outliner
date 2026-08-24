const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo/Tasks%20and%20Habits', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000); // Wait for rendering

  await page.screenshot({ path: 'tasks.png' });

  const text = await page.evaluate(() => document.body.innerText);
  console.log("PAGE TEXT AFTER NAV:\n", text);

  // Click Add Database
  await page.click('text=Add Database');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'tasks_add_db.png' });

  await browser.close();
})();
