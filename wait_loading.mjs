import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo/test-page-xyz', { waitUntil: 'networkidle' });

  // wait until "Loading Demo..." disappears
  await page.waitForFunction(() => !document.body.innerText.includes('Loading Demo...'), { timeout: 10000 }).catch(e => console.log("Timeout waiting for loading demo to disappear"));

  const content = await page.evaluate(() => document.body.innerText);
  console.log("Body text:");
  console.log(content.substring(0, 1000));

  const toolbars = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, a, [role="button"]')).map(el => ({
      text: el.innerText.trim(),
      title: el.title,
      ariaLabel: el.getAttribute('aria-label')
    }));
  });
  console.log("Buttons:");
  console.log(toolbars.filter(t => t.text.includes('History') || t.text.includes('Diff') || t.ariaLabel?.includes('History') || t.title?.includes('History') || t.text.includes('Image') || t.text.includes('Item')));

  await browser.close();
})();
