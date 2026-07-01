import { chromium } from "playwright";

(async () => {
    const browser = await chromium.launch();

    const page1 = await browser.newPage();
    await page1.goto("https://outliner-d57b0.web.app/demo", { waitUntil: "networkidle" });
    await page1.waitForTimeout(3000);

    const page2 = await browser.newPage();
    await page2.goto("https://outliner-d57b0.web.app/demo/Welcome", { waitUntil: "networkidle" });
    await page2.waitForTimeout(3000);

    console.log("Clicking 'Reset demo content' button on page1");
    const button = await page1.getByRole("button", { name: "Reset demo content" });
    await button.click();

    await page1.waitForTimeout(5000);

    // See what page2 looks like
    await page2.screenshot({ path: "demo_page_after_reset.png" });

    await browser.close();
})();
