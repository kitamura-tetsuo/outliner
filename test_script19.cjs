const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('http://localhost:7090/demo/NonExistentPage123');

  // Wait for load
  await page.waitForTimeout(5000);

  // Wait, if early return happens before finally? NO, in JavaScript, finally block is ALWAYS executed after try block, even if there's a return.
  // Let me prove it to myself.

  const text = await page.evaluate(() => {
     let x = true;
     try {
         return 'returned';
     } finally {
         x = false;
         console.log('Finally block executed, x = ', x);
     }
  });

  await browser.close();
})();
