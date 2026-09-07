import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo', { waitUntil: 'networkidle' });

  await page.click('button:has-text("Databases")');
  await page.waitForTimeout(1000);

  const content = await page.evaluate(() => {
    // See if a drawer is open
    const drawer = document.querySelector('.drawer, aside:not(.sidebar)');
    return drawer ? drawer.innerText : document.body.innerText.substring(0, 500) + ' (Drawer not found)';
  });
  console.log("Drawer content:");
  console.log(content);

  await browser.close();
})();
