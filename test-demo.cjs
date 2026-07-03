const { chromium } = require("playwright");

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    const errors = [];
    page.on("console", msg => {
        if (msg.type() === "error") {
            errors.push(msg.text());
        }
    });

    page.on("pageerror", error => {
        errors.push(error.message);
    });

    await page.goto("https://outliner-d57b0.web.app/demo");
    await page.waitForTimeout(5000);

    console.log("Console Errors:", errors);
    await browser.close();
})();
