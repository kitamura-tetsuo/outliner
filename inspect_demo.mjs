import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo', { waitUntil: 'networkidle' });

  const html = await page.content();
  console.log("HTML length:", html.length);

  // Get text content of body
  const text = await page.evaluate(() => document.body.innerText);
  console.log("Body text:");
  console.log(text.substring(0, 1000));

  // Take a screenshot
  await page.screenshot({ path: 'demo_screenshot.png' });

  await browser.close();
})();
