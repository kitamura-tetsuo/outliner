const { chromium } = require("playwright");

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    await page.goto("http://localhost:7090/demo/NonExistentPage123");

    await page.waitForTimeout(5000);

    const h1 = await page.evaluate(() => {
        return document.querySelector("h1")?.innerText;
    });
    console.log("H1:", h1);

    const consoleMessages = [];
    page.on("console", msg => {
        consoleMessages.push(msg.text());
    });

    const btn = await page.evaluate(() => {
        const button = document.querySelector('button[data-testid="search-toggle-button"]');
        if (button) button.click();
        return button !== null;
    });
    console.log("Search button clicked:", btn);

    await page.waitForTimeout(1000);

    console.log("Console messages:", consoleMessages);

    await browser.close();
})();
