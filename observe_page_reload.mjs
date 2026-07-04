import { chromium } from "playwright";

(async () => {
    const browser = await chromium.launch();

    const page1 = await browser.newPage();
    await page1.goto("https://outliner-d57b0.web.app/demo/Welcome", { waitUntil: "networkidle" });
    await page1.waitForTimeout(3000);

    const page2 = await browser.newPage();
    await page2.goto("https://outliner-d57b0.web.app/demo", { waitUntil: "networkidle" });
    await page2.waitForTimeout(3000);

    console.log("Clicking 'Reset demo content' button on page2");
    const button = await page2.getByRole("button", { name: "Reset demo content" });
    await button.click();

    await page2.waitForTimeout(5000);

    // See what page1 looks like after reset
    await page1.screenshot({ path: "demo_page_after_reset_2.png" });

    await browser.close();
})();
