const { chromium } = require("playwright");

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    const errors = [];
    page.on("console", msg => {
        if (msg.type() === "error" || msg.type() === "warning") {
            errors.push(`${msg.type().toUpperCase()}: ${msg.text()}`);
        }
    });

    page.on("pageerror", error => {
        errors.push(`PAGEERROR: ${error.message}`);
    });

    console.log("Navigating to demo...");
    await page.goto("https://outliner-d57b0.web.app/demo/Getting%20Started");
    await page.waitForTimeout(5000);

    console.log("Adding outline item...");
    // Try to find the add item button
    const addItemBtn = await page.getByRole("button", { name: "Add Item" });
    if (await addItemBtn.isVisible()) {
        await addItemBtn.click();
        await page.waitForTimeout(2000);
    }

    // Type something
    await page.keyboard.type("Test item added by automation");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2000);

    console.log("--- Errors ---");
    console.log(errors.join("\n"));
    await browser.close();
})();
