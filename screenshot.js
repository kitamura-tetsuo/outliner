import { chromium } from 'playwright';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);

  // Try to click "Sign in" to understand auth better
  // or see what "Not signed in" looks like

  // also grab the HTML to see what's on the page
  const html = await page.content();
  require('fs').writeFileSync('demo.html', html);

  await browser.close();
})();
