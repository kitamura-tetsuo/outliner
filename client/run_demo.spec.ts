import { expect, test } from "@playwright/test";

test("check demo page errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", msg => {
        if (msg.type() === "error") {
            errors.push(`Console error: ${msg.text()}`);
        }
    });
    page.on("pageerror", error => {
        errors.push(`Page error: ${error.message}`);
    });

    await page.goto("http://localhost:5173/demo");
    await page.waitForTimeout(2000);

    console.log("Errors found on page load:");
    console.log(errors);
});
