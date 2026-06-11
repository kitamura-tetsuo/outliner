const { chromium } = require("playwright");

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    const errors = [];
    page.on("console", msg => {
        if (msg.type() === "error") {
            errors.push(`Console Error: ${msg.text()}`);
        }
    });
    page.on("pageerror", error => {
        errors.push(`Page Error: ${error.message}`);
    });

    console.log("Navigating to demo page...");
    await page.goto("http://localhost:5173/demo");
    await page.waitForTimeout(5000);

    console.log("Errors found on page load:");
    console.log(errors);

    await browser.close();
})();
