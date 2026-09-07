import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo', { waitUntil: 'networkidle' });

  // Try to click the left sidebar toggle which is at x=16, y=12
  await page.click('.sidebar-toggle');
  await page.waitForTimeout(500); // wait for animation

  const sidebarContent = await page.evaluate(() => {
    const aside = document.querySelector('nav[aria-label="Sidebar"], .sidebar, aside');
    if (aside) return aside.innerText;
    return "No aside found";
  });
  console.log("Left sidebar text after click:");
  console.log(sidebarContent.substring(0, 500));

  await browser.close();
})();
