const { chromium } = require("playwright");

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    page.on("console", msg => {
        if (msg.type() === "error") {
            console.log(`Console Error: ${msg.text()}`);
        } else if (msg.type() === "warning") {
            console.log(`Console Warning: ${msg.text()}`);
        } else {
            console.log(`Console ${msg.type()}: ${msg.text()}`);
        }
    });

    page.on("pageerror", error => {
        console.log(`Page Error: ${error.message}`);
    });

    console.log("Navigating to demo...");
    await page.goto("https://outliner-d57b0.web.app/demo", { waitUntil: "networkidle" });

    await page.waitForTimeout(2000);

    // Try to click something or do an action
    // We'll just wait and then close for now
    console.log("Waiting a bit...");
    await page.waitForTimeout(5000);

    console.log("Done.");
    await browser.close();
})();
