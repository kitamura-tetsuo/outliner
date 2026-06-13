const { chromium } = require("playwright");

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    const consoleErrors = [];
    page.on("console", msg => {
        if (msg.type() === "error" || msg.type() === "warning") {
            consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
        }
    });
    page.on("pageerror", err => consoleErrors.push(`[pageerror] ${err.message}`));

    console.log("Navigating to https://outliner-d57b0.web.app/demo/Formatting ...");
    await page.goto("https://outliner-d57b0.web.app/demo/Formatting", { waitUntil: "networkidle" });

    await page.waitForTimeout(5000);

    console.log("Console Warnings/Errors found:");
    console.log(consoleErrors);

    await browser.close();
})();
