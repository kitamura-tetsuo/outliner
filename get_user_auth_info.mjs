import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo', { waitUntil: 'networkidle' });

  // Try to find the top toolbar elements and the "Not signed in" indicator
  const toolbarText = await page.evaluate(() => {
    const topBar = document.querySelector('nav, header, [role="banner"], .top-bar, [class*="toolbar"]');
    return topBar ? topBar.innerText : 'No top bar found';
  });
  console.log("Top bar text:");
  console.log(toolbarText);

  const notSignedInElement = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('*')).find(e => e.textContent === 'Not signed in' && e.children.length === 0);
    if (!el) return 'Not found';

    // Get its location in the DOM
    let path = [];
    let current = el;
    while (current && current.tagName) {
      path.push(current.tagName.toLowerCase());
      current = current.parentElement;
    }

    // Get location on screen
    const rect = el.getBoundingClientRect();

    return {
      path: path.reverse().join(' > '),
      position: { x: rect.x, y: rect.y, right: rect.right },
      windowWidth: window.innerWidth
    };
  });
  console.log("Not signed in element info:");
  console.log(JSON.stringify(notSignedInElement, null, 2));

  // Check the sidebar toggle button
  const sidebarButton = await page.evaluate(() => {
    const el = document.querySelector('[aria-label="Toggle sidebar"], [title="Toggle sidebar"], button'); // naive check
    if (!el) return 'Not found';

    const rect = el.getBoundingClientRect();
    return {
      position: { x: rect.x, y: rect.y }
    };
  });
  console.log("Sidebar button info (first button found):");
  console.log(JSON.stringify(sidebarButton, null, 2));

  await browser.close();
})();
