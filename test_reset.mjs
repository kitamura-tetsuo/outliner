import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', error => logs.push(`[error] ${error.message}`));

  page.on('request', request => console.log('>>', request.method(), request.url()));
  page.on('response', response => console.log('<<', response.status(), response.url()));

  console.log("Navigating to demo...");
  await page.goto('https://outliner-d57b0.web.app/demo', { waitUntil: 'networkidle' });

  // Wait a bit
  await page.waitForTimeout(3000);

  console.log("Clicking 'Reset demo content' button");
  const button = await page.getByRole('button', { name: 'Reset demo content' });
  await button.click();

  await page.waitForTimeout(1000);

  console.log("Checking if a network request is made...");

  await browser.close();
})();
