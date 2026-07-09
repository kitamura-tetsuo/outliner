const { chromium } = require("playwright");

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    page.on("console", msg => console.log(`CONSOLE [${msg.type()}]: ${msg.text()}`));
    page.on("pageerror", error => console.log(`ERROR: ${error.message}`));
    page.on("requestfailed", request => console.log(`FAILED: ${request.url()} - ${request.failure().errorText}`));

    console.log("Navigating to https://outliner-d57b0.web.app/demo ...");
    await page.goto("https://outliner-d57b0.web.app/demo", { waitUntil: "networkidle" });

    await page.waitForTimeout(5000); // Wait a bit for async stuff

    await page.screenshot({ path: "demo_screenshot.png" });
    console.log("Screenshot saved.");

    await browser.close();
})();
