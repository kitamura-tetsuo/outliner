import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  page.on('response', response => {
    if (response.url().includes('seed-demo')) {
      console.log('<<', response.status(), response.url());
      response.text().then(text => console.log('body:', text));
    }
  });

  console.log("Navigating to demo...");
  await page.goto('https://outliner-d57b0.web.app/demo', { waitUntil: 'networkidle' });

  // Wait a bit
  await page.waitForTimeout(3000);

  console.log("Clicking 'Reset demo content' button");
  const button = await page.getByRole('button', { name: 'Reset demo content' });
  await button.click();

  await page.waitForTimeout(2000);

  await browser.close();
})();
