const { chromium } = require("playwright");

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    page.on("console", msg => console.log(`CONSOLE [${msg.type()}] ${msg.text()}`));
    page.on("pageerror", error => console.log(`PAGE ERROR: ${error.message}`));

    console.log("Navigating to demo");
    await page.goto("http://127.0.0.1:7090/demo/Advanced%20Features", { waitUntil: "networkidle" });
    await page.waitForTimeout(5000);

    console.log("Capturing screenshot");
    await page.screenshot({ path: "/app/screenshot_advanced_features.png", fullPage: true });

    await browser.close();
})();
