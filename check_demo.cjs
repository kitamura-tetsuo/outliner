const { chromium } = require("playwright");

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    page.on("console", msg => {
        console.log(`Console [${msg.type()}]:`, msg.text());
    });

    page.on("pageerror", error => {
        console.log("PageError:", error.message);
    });

    await page.goto("https://outliner-d57b0.web.app/demo");
    console.log("Waiting for 35 seconds...");
    await page.waitForTimeout(35000);
    await page.screenshot({ path: "demo_screenshot_35s.png" });

    await browser.close();
})();
