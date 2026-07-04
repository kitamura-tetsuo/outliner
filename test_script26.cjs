const { test, expect } = require("@playwright/test");
const { chromium } = require("playwright");

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    await page.goto("http://localhost:7090/demo/NonExistentPage123");

    // Wait for load
    await page.waitForTimeout(5000);

    const h1 = await page.evaluate(() => {
        return document.querySelector("h1")?.innerText;
    });
    console.log("h1:", h1);

    const isLoading_value = await page.evaluate(() => {
        // I will temporarily expose isLoading in the svelte file using sed and check if it gets updated.
    });

    await browser.close();
})();
