const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('http://localhost:7090/demo/NonExistentPage123');

  // Wait for load
  await page.waitForTimeout(5000);

  const text = await page.evaluate(() => {
     let x = 1;
     const f = async () => {
        try {
            x = 2;
            if (true) return;
        } finally {
            x = 3;
        }
     };
     return f().then(() => x);
  });
  console.log("x =", text);

  await browser.close();
})();
