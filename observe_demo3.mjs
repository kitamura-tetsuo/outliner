import { chromium } from 'playwright';
import fs from 'fs';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', error => logs.push(`[error] ${error.message}`));

  console.log("Navigating to demo...");
  await page.goto('https://outliner-d57b0.web.app/demo', { waitUntil: 'networkidle' });

  // Wait a bit
  await page.waitForTimeout(3000);

  console.log("Clicking 'Reset demo content' button");
  const button = await page.getByRole('button', { name: 'Reset demo content' });
  await button.click();

  await page.waitForTimeout(5000);

  console.log("Console Logs from Demo:");
  console.log(logs.join('\n'));

  await browser.close();
})();
