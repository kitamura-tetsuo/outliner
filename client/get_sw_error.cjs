const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', async msg => {
    if (msg.type() === 'error' || msg.text().includes('Service worker')) {
        const text = msg.text();
        const args = msg.args();
        let errorDetails = "";
        if (args.length > 0) {
            try {
                // Try to get properties of the error object if it is one
                const errorObj = await args[args.length - 1].getProperty('message');
                if (errorObj) {
                    errorDetails = await errorObj.jsonValue();
                } else {
                    errorDetails = await args[args.length - 1].jsonValue();
                }
            } catch (e) {
                errorDetails = 'Could not extract details';
            }
        }
        console.log('Console:', text, 'Details:', errorDetails);
    }
  });

  await page.goto('http://localhost:5173/demo');
  await page.waitForTimeout(5000);
  await browser.close();
})();
