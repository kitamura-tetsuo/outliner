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

    await page.goto("http://localhost:5173/demo");
    await page.waitForTimeout(2000);

    console.log("Errors found on page load:");
    console.log(errors);

    await browser.close();
})();
