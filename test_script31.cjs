const { chromium } = require("playwright");

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    await page.goto("http://localhost:7090/demo/NonExistentPage123");

    // Wait for load
    await page.waitForTimeout(5000);

    const h1 = await page.evaluate(() => document.querySelector("h1")?.innerText);
    console.log("h1:", h1);

    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log("Loading Demo:", bodyText.includes("Loading Demo..."));

    await browser.close();
})();
