import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo', { waitUntil: 'networkidle' });

  // Click Add Database button in top bar
  await page.click('button:has-text("Add Database")');
  await page.waitForTimeout(1000);

  // Let's see what inputs or modal appeared
  const newContent = await page.evaluate(() => {
    return document.body.innerText;
  });

  console.log("Body text after Add Database:");
  console.log(newContent.substring(0, 1000));

  await browser.close();
})();
