const { chromium } = require("playwright");

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    await page.goto("http://localhost:7090/demo/NonExistentPage123");

    await page.waitForTimeout(5000);

    const state = await page.evaluate(() => {
        // Check what state is inside window.__PAGE_STATE__
        return window.__PAGE_STATE__;
    });
    console.log("__PAGE_STATE__:", state);

    await browser.close();
})();
