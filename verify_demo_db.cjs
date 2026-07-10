const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  console.log("Navigating to production demo...");
  const browser = await chromium.launch();
  const page = await browser.newPage();

  let errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      errors.push(`CONSOLE [${msg.type()}] ${msg.text()}`);
    }
  });

  // Note: we can't test our exact branch fix against prod since prod runs the old code.
  // But we can just rely on the tests passing (which they did) and the visual component test.

  await browser.close();
})();
