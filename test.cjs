const { chromium } = require("playwright");
(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const startTime = Date.now();
    page.on("console", msg => {
        if (msg.type() === "error" || msg.type() === "warning") {
            console.log(`[${Date.now() - startTime}ms] Console [${msg.type()}]:`, msg.text());
        }
    });

    await page.goto("https://outliner-d57b0.web.app/projects/new");
    await page.waitForTimeout(3000);
    const content = await page.content();
    console.log(content.substring(0, 100));
    await browser.close();
})();
