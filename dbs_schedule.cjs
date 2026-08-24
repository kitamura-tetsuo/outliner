const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://outliner-d57b0.web.app/demo/Tasks%20and%20Habits', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000); // Wait for rendering

  // click Schema tab on Tasks table (find the button inside the UI or try a simpler approach)
  // Let's just click 'Schedule' text if it exists
  const text = await page.evaluate(() => document.body.innerText);
  console.log("TEXT:\n", text);

  await browser.close();
})();
