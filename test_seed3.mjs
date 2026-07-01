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

  // Click on a page to navigate there
  console.log("Navigating to Welcome page directly...");
  await page.goto('https://outliner-d57b0.web.app/demo/Welcome', { waitUntil: 'networkidle' });

  await page.waitForTimeout(5000);

  await browser.close();
})();
