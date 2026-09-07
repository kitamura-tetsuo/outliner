import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo', { waitUntil: 'networkidle' });

  await page.click('.sidebar-toggle');
  await page.waitForTimeout(500);

  const sidebarContent = await page.evaluate(() => {
    const aside = document.querySelector('nav[aria-label="Sidebar"], .sidebar, aside');
    if (aside) return aside.innerText;
    return "No aside found";
  });
  console.log("Left sidebar full text:");
  console.log(sidebarContent);

  await browser.close();
})();
