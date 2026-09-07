import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo', { waitUntil: 'networkidle' });

  const createSectionHtml = await page.evaluate(() => {
    const createBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Create'));
    if (!createBtn) return "Create button not found";

    // Get the parent container to see inputs
    const container = createBtn.parentElement.parentElement;
    return container.innerHTML;
  });

  console.log("Create page section HTML:");
  console.log(createSectionHtml);

  await browser.close();
})();
