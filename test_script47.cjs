const { test, expect } = require("@playwright/test");
const { chromium } = require("playwright");

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    // Test what `document.querySelector('body')` innerHTML is for a non-existent demo page
    // We want to verify `isLoading` is still `true` after 5 seconds.
    await page.goto("http://localhost:7090/demo/NonExistentPage123");

    await page.waitForTimeout(5000);

    const text = await page.evaluate(() => document.body.innerHTML);
    console.log("Includes Loading Demo:", text.includes("Loading Demo..."));

    await browser.close();
})();
