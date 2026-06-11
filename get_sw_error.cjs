const { chromium } = require("playwright");
(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    page.on("console", msg => {
        if (msg.type() === "error" || msg.text().includes("Service worker")) {
            console.log("Console:", msg.text());
        }
    });
    await page.goto("http://localhost:5173/demo");
    await page.waitForTimeout(5000);
    await browser.close();
})();
