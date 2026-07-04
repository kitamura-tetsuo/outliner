const { chromium } = require("playwright");

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    const consoleErrors = [];
    page.on("console", msg => {
        if (msg.type() === "error" && msg.text().includes("isLoading")) {
            consoleErrors.push(msg.text());
        }
    });

    await page.goto("http://localhost:7090/demo/NonExistentPage123");

    // Wait for load
    await page.waitForTimeout(5000);

    console.log("Console errors:", consoleErrors);

    await browser.close();
})();
