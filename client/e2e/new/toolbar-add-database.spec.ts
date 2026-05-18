import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";

registerCoverageHooks();

test.describe("Toolbar Add Database Feature", () => {
    test("Add Database button is displayed and works", async ({ page }) => {
        // Simple verification that the button renders and is clickable
        await page.goto("http://localhost:7090/");
        const addDbBtn = page.getByTestId("add-database-btn").first();
        await expect(addDbBtn).toBeVisible({ timeout: 15000 });
        await addDbBtn.click();
    });
});
