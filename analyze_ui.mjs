import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo', { waitUntil: 'networkidle' });

  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, a[role="button"]')).map(btn => {
      const rect = btn.getBoundingClientRect();
      return {
        text: btn.innerText.trim() || btn.textContent.trim(),
        ariaLabel: btn.getAttribute('aria-label'),
        title: btn.getAttribute('title'),
        classes: btn.className,
        x: rect.x,
        y: rect.y
      };
    }).filter(b => b.x >= 0 && b.y >= 0); // visible
  });

  console.log("Buttons:");
  console.log(JSON.stringify(buttons, null, 2));

  // Search for hamburger menu / sidebar toggle
  const sidebarToggle = buttons.find(b => b.ariaLabel && b.ariaLabel.toLowerCase().includes('sidebar') || b.title && b.title.toLowerCase().includes('sidebar'));
  console.log("Sidebar toggle:", sidebarToggle);

  const sidebarContent = await page.evaluate(() => {
    const aside = document.querySelector('aside, .sidebar, [role="navigation"]');
    if (aside) return aside.innerText;
    return "No aside found";
  });
  console.log("Sidebar text:");
  console.log(sidebarContent.substring(0, 500));

  await browser.close();
})();
