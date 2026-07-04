const { chromium } = require("playwright");

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    await page.goto("http://localhost:7090/demo/NonExistentPage123");

    await page.waitForTimeout(5000);

    const text = await page.evaluate(() => document.body.innerHTML);
    console.log("Includes Loading Demo:", text.includes("Loading Demo..."));

    await browser.close();
})();
