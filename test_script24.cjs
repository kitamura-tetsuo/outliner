const { chromium } = require("playwright");

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    await page.goto("http://localhost:7090/demo/NonExistentPage123");

    // Wait for load
    await page.waitForTimeout(5000);

    const text = await page.evaluate(() => {
        return window.appStore?.currentPage;
    });
    console.log("window.appStore?.currentPage:", text);

    const hasPageNotFound = await page.evaluate(() => {
        return window.appStore?.pageExists("NonExistentPage123");
    });
    console.log("window.appStore?.pageExists:", hasPageNotFound);

    await browser.close();
})();
