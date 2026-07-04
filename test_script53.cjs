const { chromium } = require("playwright");

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    await page.goto("http://localhost:7090/demo/NonExistentPage123");

    await page.waitForTimeout(5000);

    const state = await page.evaluate(() => {
        return [
            document.body.innerHTML.includes("Loading Demo..."),
            document.body.innerHTML.includes("Page not found"),
            !!document.querySelector(".loader"),
        ];
    });
    console.log("State:", state);

    await browser.close();
})();
