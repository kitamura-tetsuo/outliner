import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', error => logs.push(`[error] ${error.message}`));

  console.log("Navigating to demo/Welcome...");
  await page.goto('https://outliner-d57b0.web.app/demo/Welcome', { waitUntil: 'networkidle' });

  // Wait a bit
  await page.waitForTimeout(3000);

  console.log("Console Logs from Demo Page:");
  console.log(logs.join('\n'));

  await browser.close();
})();
