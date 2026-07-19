import { test, expect } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test("Toggle and save table schedules", async ({ page }, testInfo) => {
    await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Item Names"]);

    // Add a table via command palette
    await page.keyboard.press("Meta+k");
    await page.waitForTimeout(500);
    await page.keyboard.type("Database");
    await page.waitForTimeout(500);
    await page.keyboard.press("Enter");

    // Wait for the table to appear and toggle button to exist
    await page.waitForSelector(".toggle-schedules-btn", { timeout: 10000 });
    await page.click(".toggle-schedules-btn");

    // Wait for the editor to appear
    await page.waitForSelector(".schedules-editor", { timeout: 5000 });

    // Type in a schedule
    await page.fill(".add-schedule input[placeholder*='RRULE']", "FREQ=DAILY");
    await page.click(".add-schedule button:has-text('Save')");

    // Wait for schedule item to appear
    await page.waitForSelector(".schedule-item", { timeout: 5000 });

    // Verify it was added
    const text = await page.textContent(".schedule-item");
    expect(text).toContain("FREQ=DAILY");
});
