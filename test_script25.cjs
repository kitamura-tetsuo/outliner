const { chromium } = require("playwright");

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    await page.goto("http://localhost:7090/demo/NonExistentPage123");

    // Wait for load
    await page.waitForTimeout(5000);

    // Execute a script that overrides console.log to capture everything in page context
    const text = await page.evaluate(() => {
        let x = 0;
        try {
            x += 1;
            return "returned";
        } finally {
            x += 10;
            window.finallyRan = true;
        }
    });

    console.log("finallyRan:", await page.evaluate(() => window.finallyRan));

    await browser.close();
})();
