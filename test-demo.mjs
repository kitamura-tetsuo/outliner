import { chromium } from "playwright";

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const errors = [];
    page.on("console", msg => {
        if (msg.type() === "error") {
            errors.push(msg.text());
        }
    });
    page.on("pageerror", error => {
        errors.push(error.message);
    });

    console.log("Navigating to the demo site...");
    await page.goto("https://outliner-d57b0.web.app/demo/outliner-basics", { waitUntil: "networkidle" });

    await page.waitForTimeout(2000);

    console.log("Console errors found on outliner page:", errors);

    await page.screenshot({ path: "demo-outliner-screenshot.png" });
    console.log("Saved demo-outliner-screenshot.png");

    try {
        const inputs = await page.$$('input, [contenteditable="true"]');
        if (inputs.length > 0) {
            await inputs[0].click();
            await page.keyboard.press("Enter");
            await page.waitForTimeout(1000);
            console.log("Pressed Enter in first contenteditable");
        }
    } catch (e) {
        console.log("Action error:", e);
    }

    console.log("Console errors after actions:", errors);

    await browser.close();
})();
