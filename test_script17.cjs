const { chromium } = require("playwright");

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    await page.goto("http://localhost:7090/demo/NonExistentPage123");

    // Wait for load
    await page.waitForTimeout(5000);

    const isLoadingValue = await page.evaluate(() => {
        // We can try to attach it to window in the svelte file if we edit it temporarily,
        // but let's just edit it now.
    });

    await browser.close();
})();
