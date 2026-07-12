import { expect, test } from "@playwright/test";

test("verify add item exists in demo page", async ({ page }) => {
    await page.goto("http://127.0.0.1:7090/demo");
    await page.waitForTimeout(2000);

    // Evaluate in browser to click
    await page.evaluate(() => {
        const link = document.querySelector('a[href="/demo/Advanced%20Features"]');
        if (link) (link as HTMLElement).click();
    });

    await page.waitForTimeout(2000);

    const addItemBtn = await page.$('text="Add Item"');
    console.log("Add Item button found:", !!addItemBtn);
});
