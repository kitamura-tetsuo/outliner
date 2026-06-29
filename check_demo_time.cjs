const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const startTime = Date.now();
    page.on('console', msg => {
        console.log(`[${Date.now() - startTime}ms] Console [${msg.type()}]:`, msg.text());
    });

    await page.goto('https://outliner-d57b0.web.app/demo');
    await page.waitForTimeout(35000);
    await browser.close();
})();
