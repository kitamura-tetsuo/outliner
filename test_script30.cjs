const { chromium } = require("playwright");

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    await page.goto("http://localhost:7090/demo/NonExistentPage123");

    // Wait for load
    await page.waitForTimeout(5000);

    const loaderState = await page.evaluate(() => {
        const loader = document.querySelector(".loader");
        return loader ? window.getComputedStyle(loader).display : null;
    });
    console.log("Loader display:", loaderState);

    const text = await page.evaluate(() => document.body.innerHTML);
    console.log("Body includes 'Page not found':", text.includes("Page not found"));

    await browser.close();
})();
