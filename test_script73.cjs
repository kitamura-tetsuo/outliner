const { test, expect } = require("@playwright/test");
const { chromium } = require("playwright");

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    await page.goto("http://localhost:7090/demo/NonExistentPage123");

    await page.waitForTimeout(5000);

    const h1 = await page.evaluate(() => {
        return document.querySelector("h1")?.innerText;
    });
    console.log("H1:", h1);

    const text = await page.evaluate(() => {
        return [
            document.body.innerHTML.includes("Loading Demo..."),
            document.body.innerHTML.includes("Page not found"),
            !!document.querySelector(".loader"),
        ];
    });
    console.log("State:", text);

    await browser.close();
})();
