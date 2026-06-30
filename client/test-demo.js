import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('http://localhost:7080/demo');

  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Take screenshot
  await page.screenshot({ path: 'demo-local.png' });

  // Get console logs
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));

  await browser.close();
})();
