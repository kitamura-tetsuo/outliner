const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo/Welcome');
  await page.waitForTimeout(2000);

  const toggle = await page.$('.sidebar-toggle');
  if (toggle) {
    await toggle.click();
    await page.waitForTimeout(1000);
  }

  const sidebarText = await page.evaluate(() => {
    const sidebar = document.querySelector('nav, aside, .sidebar-content, [role="navigation"]');
    if (!sidebar) return "No sidebar found";

    const items = Array.from(sidebar.querySelectorAll('button, a, .section-header')).map(el => {
       return el.innerText.trim() || el.getAttribute('aria-label') || '';
    }).filter(t => t);
    return items.join('\n');
  });
  console.log(sidebarText);

  await browser.close();
})();
