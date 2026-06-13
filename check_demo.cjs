const { chromium } = require("playwright");

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    page.on("console", msg => console.log(`CONSOLE [${msg.type()}] ${msg.text()}`));
    page.on("pageerror", err => console.log(`PAGE ERROR: ${err.message}`));

    console.log("Navigating to https://outliner-d57b0.web.app/demo ...");
    await page.goto("https://outliner-d57b0.web.app/demo", { waitUntil: "networkidle" });

    console.log("Waiting a bit for initial setup...");
    await page.waitForTimeout(5000);

    await browser.close();
})();
